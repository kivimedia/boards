-- Migration 025: WhatsApp Integration (P4.0-4.1)
-- Phone linking, department groups, notifications, quick actions, digest

-- ============================================================================
-- WHATSAPP USERS (phone linking)
-- ============================================================================
CREATE TABLE whatsapp_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  verification_code TEXT,
  verification_expires_at TIMESTAMPTZ,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dnd_start TIME,
  dnd_end TIME,
  opt_out BOOLEAN NOT NULL DEFAULT false,
  frequency_cap_per_hour INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id),
  UNIQUE(phone_number)
);

CREATE INDEX idx_whatsapp_users_user ON whatsapp_users(user_id);
CREATE INDEX idx_whatsapp_users_phone ON whatsapp_users(phone_number);

-- ============================================================================
-- WHATSAPP GROUPS (department groups)
-- ============================================================================
CREATE TABLE whatsapp_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  department TEXT,
  group_name TEXT NOT NULL,
  whatsapp_group_id TEXT, -- external WhatsApp group ID
  is_active BOOLEAN NOT NULL DEFAULT true,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_groups_board ON whatsapp_groups(board_id);
CREATE INDEX idx_whatsapp_groups_dept ON whatsapp_groups(department);

-- ============================================================================
-- WHATSAPP MESSAGES (message log)
-- ============================================================================
CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_user_id UUID REFERENCES whatsapp_users(id) ON DELETE SET NULL,
  group_id UUID REFERENCES whatsapp_groups(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  message_type TEXT NOT NULL CHECK (message_type IN ('notification', 'quick_action', 'digest', 'verification', 'reply')),
  content TEXT NOT NULL,
  whatsapp_message_id TEXT, -- external message ID from Meta
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_messages_user ON whatsapp_messages(whatsapp_user_id);
CREATE INDEX idx_whatsapp_messages_group ON whatsapp_messages(group_id);
CREATE INDEX idx_whatsapp_messages_status ON whatsapp_messages(status);
CREATE INDEX idx_whatsapp_messages_created ON whatsapp_messages(created_at);

-- ============================================================================
-- WHATSAPP QUICK ACTIONS
-- ============================================================================
CREATE TABLE whatsapp_quick_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('mark_done', 'approve', 'reject', 'assign', 'comment', 'snooze')),
  action_config JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(keyword)
);

-- Seed default quick actions
INSERT INTO whatsapp_quick_actions (keyword, action_type, description) VALUES
  ('done', 'mark_done', 'Mark the card as completed'),
  ('approve', 'approve', 'Approve the card'),
  ('reject', 'reject', 'Reject and request revision'),
  ('snooze', 'snooze', 'Snooze notifications for 24 hours');

-- ============================================================================
-- WHATSAPP DIGEST CONFIG
-- ============================================================================
CREATE TABLE whatsapp_digest_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  send_time TIME NOT NULL DEFAULT '08:00',
  include_overdue BOOLEAN NOT NULL DEFAULT true,
  include_assigned BOOLEAN NOT NULL DEFAULT true,
  include_mentions BOOLEAN NOT NULL DEFAULT true,
  include_board_summary BOOLEAN NOT NULL DEFAULT false,
  board_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- ============================================================================
-- NOTIFICATION DISPATCH LOG (tracks which notifications were sent via WhatsApp)
-- ============================================================================
CREATE TABLE whatsapp_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  whatsapp_user_id UUID NOT NULL REFERENCES whatsapp_users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  throttled BOOLEAN NOT NULL DEFAULT false,
  throttle_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_notif_log_user ON whatsapp_notification_log(whatsapp_user_id);
CREATE INDEX idx_wa_notif_log_created ON whatsapp_notification_log(created_at);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE whatsapp_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_quick_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_digest_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_users_select" ON whatsapp_users FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wa_users_insert" ON whatsapp_users FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wa_users_update" ON whatsapp_users FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wa_users_delete" ON whatsapp_users FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "wa_groups_select" ON whatsapp_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_groups_insert" ON whatsapp_groups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "wa_groups_update" ON whatsapp_groups FOR UPDATE TO authenticated USING (true);
CREATE POLICY "wa_groups_delete" ON whatsapp_groups FOR DELETE TO authenticated USING (true);

CREATE POLICY "wa_messages_select" ON whatsapp_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_messages_insert" ON whatsapp_messages FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "wa_quick_actions_select" ON whatsapp_quick_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_quick_actions_insert" ON whatsapp_quick_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "wa_quick_actions_update" ON whatsapp_quick_actions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "wa_quick_actions_delete" ON whatsapp_quick_actions FOR DELETE TO authenticated USING (true);

CREATE POLICY "wa_digest_select" ON whatsapp_digest_config FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wa_digest_insert" ON whatsapp_digest_config FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wa_digest_update" ON whatsapp_digest_config FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "wa_notif_log_select" ON whatsapp_notification_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_notif_log_insert" ON whatsapp_notification_log FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_whatsapp_users_updated_at
  BEFORE UPDATE ON whatsapp_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_whatsapp_groups_updated_at
  BEFORE UPDATE ON whatsapp_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_whatsapp_digest_updated_at
  BEFORE UPDATE ON whatsapp_digest_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
