-- Migration 007: Notifications & Cross-Board Workflows (P1.6)
-- Notifications, notification preferences, handoff rules, onboarding templates

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- type values: 'card_assigned', 'card_mentioned', 'card_moved', 'card_due_soon',
--   'card_overdue', 'comment_added', 'handoff_created', 'brief_incomplete',
--   'approval_needed', 'onboarding_started', 'automation_triggered'

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE NOT is_read;
CREATE INDEX idx_notifications_card_id ON notifications(card_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================================================
-- NOTIFICATION PREFERENCES
-- ============================================================================
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Per-event settings as JSONB: { "card_assigned": true, "comment_added": false, ... }
  event_settings JSONB NOT NULL DEFAULT '{}',
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);

-- ============================================================================
-- HANDOFF RULES (cross-board card creation on column move)
-- ============================================================================
CREATE TABLE handoff_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  source_column TEXT NOT NULL,
  target_board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  target_column TEXT NOT NULL,
  inherit_fields JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- inherit_fields: ["title", "description", "priority", "client_id", "labels", "custom_fields"]

CREATE INDEX idx_handoff_rules_source ON handoff_rules(source_board_id, source_column);
CREATE INDEX idx_handoff_rules_target ON handoff_rules(target_board_id);

-- ============================================================================
-- ONBOARDING TEMPLATES (multi-board card generation from template)
-- ============================================================================
CREATE TABLE onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- template_data JSONB:
-- [
--   {
--     "board_type": "graphic_designer",
--     "title": "Create brand assets for {client_name}",
--     "description": "...",
--     "list_name": "Briefed",
--     "priority": "medium",
--     "inherit_client": true,
--     "depends_on": []  // indices of other items in this array
--   },
--   ...
-- ]

-- ============================================================================
-- EXTEND DEPENDENCY TYPE for spawned relationships
-- ============================================================================
ALTER TYPE dependency_type ADD VALUE IF NOT EXISTS 'spawned_from';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;

-- Notifications: users can only see their own
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Notification preferences: users can only manage their own
CREATE POLICY "notification_preferences_select_own" ON notification_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "notification_preferences_insert_own" ON notification_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notification_preferences_update_own" ON notification_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Handoff rules: accessible by all authenticated users
CREATE POLICY "handoff_rules_select" ON handoff_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "handoff_rules_insert" ON handoff_rules
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "handoff_rules_update" ON handoff_rules
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "handoff_rules_delete" ON handoff_rules
  FOR DELETE TO authenticated USING (true);

-- Onboarding templates: accessible by all authenticated users
CREATE POLICY "onboarding_templates_select" ON onboarding_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "onboarding_templates_insert" ON onboarding_templates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "onboarding_templates_update" ON onboarding_templates
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "onboarding_templates_delete" ON onboarding_templates
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_handoff_rules_updated_at
  BEFORE UPDATE ON handoff_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_onboarding_templates_updated_at
  BEFORE UPDATE ON onboarding_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================================================
-- SEED DEFAULT ONBOARDING TEMPLATE
-- ============================================================================
INSERT INTO onboarding_templates (name, description, template_data) VALUES
('Standard Client Onboarding', 'Creates cards across Design, Dev, Copy, and AM boards for new client onboarding', '[
  {
    "board_type": "graphic_designer",
    "title": "Create brand assets for {client_name}",
    "description": "Design initial brand assets including logo variations, social media templates, and brand guidelines document.",
    "list_name": "Briefed",
    "priority": "high",
    "inherit_client": true,
    "depends_on": []
  },
  {
    "board_type": "dev",
    "title": "Set up website for {client_name}",
    "description": "Set up hosting, domain, and initial website structure for the client.",
    "list_name": "Backlog",
    "priority": "medium",
    "inherit_client": true,
    "depends_on": [0]
  },
  {
    "board_type": "copy",
    "title": "Write initial website copy for {client_name}",
    "description": "Write all website copy including homepage, about, services, and contact pages.",
    "list_name": "Briefed",
    "priority": "high",
    "inherit_client": true,
    "depends_on": []
  },
  {
    "board_type": "account_manager",
    "title": "Client onboarding: {client_name}",
    "description": "Complete client onboarding process: collect brand assets, set up communication channels, schedule kickoff meeting.",
    "list_name": "Onboarding",
    "priority": "high",
    "inherit_client": true,
    "depends_on": []
  },
  {
    "board_type": "video_editor",
    "title": "Create intro video for {client_name}",
    "description": "Produce a short intro/welcome video for the client brand.",
    "list_name": "Briefed",
    "priority": "low",
    "inherit_client": true,
    "depends_on": [0]
  }
]');
