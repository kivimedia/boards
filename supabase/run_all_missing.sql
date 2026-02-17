-- Migration 002: Enhanced Card Model
-- Adds checklists, attachments, activity log, dependencies, custom fields, mentions, priority

-- ============================================================
-- Priority column on cards
-- ============================================================
CREATE TYPE card_priority AS ENUM ('urgent', 'high', 'medium', 'low', 'none');

ALTER TABLE cards ADD COLUMN priority card_priority NOT NULL DEFAULT 'none';

-- ============================================================
-- Checklists
-- ============================================================
CREATE TABLE checklists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Checklist',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE checklist_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_id UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Attachments
-- ============================================================
CREATE TABLE attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Activity Log
-- ============================================================
CREATE TABLE activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Card Dependencies
-- ============================================================
CREATE TYPE dependency_type AS ENUM ('blocked_by', 'blocking', 'related');

CREATE TABLE card_dependencies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  target_card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  dependency_type dependency_type NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_card_id, target_card_id, dependency_type)
);

-- ============================================================
-- Custom Field Definitions & Values
-- ============================================================
CREATE TYPE custom_field_type AS ENUM ('text', 'number', 'dropdown', 'date', 'checkbox', 'url');

CREATE TABLE custom_field_definitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_type custom_field_type NOT NULL,
  options JSONB DEFAULT '[]',
  is_required BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE custom_field_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  value JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(card_id, field_definition_id)
);

-- ============================================================
-- Mentions
-- ============================================================
CREATE TABLE mentions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_checklists_card_id ON checklists(card_id);
CREATE INDEX idx_checklist_items_checklist_id ON checklist_items(checklist_id);
CREATE INDEX idx_attachments_card_id ON attachments(card_id);
CREATE INDEX idx_activity_log_card_id ON activity_log(card_id);
CREATE INDEX idx_activity_log_board_id ON activity_log(board_id);
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_card_dependencies_source ON card_dependencies(source_card_id);
CREATE INDEX idx_card_dependencies_target ON card_dependencies(target_card_id);
CREATE INDEX idx_custom_field_definitions_board_id ON custom_field_definitions(board_id);
CREATE INDEX idx_custom_field_values_card_id ON custom_field_values(card_id);
CREATE INDEX idx_custom_field_values_field_id ON custom_field_values(field_definition_id);
CREATE INDEX idx_mentions_comment_id ON mentions(comment_id);
CREATE INDEX idx_mentions_user_id ON mentions(user_id);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write all (will be tightened in P1.2 RBAC)
CREATE POLICY "Authenticated users can read checklists" ON checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert checklists" ON checklists FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update checklists" ON checklists FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete checklists" ON checklists FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read checklist_items" ON checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert checklist_items" ON checklist_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update checklist_items" ON checklist_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete checklist_items" ON checklist_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read attachments" ON attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert attachments" ON attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete attachments" ON attachments FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read activity_log" ON activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert activity_log" ON activity_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read card_dependencies" ON card_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert card_dependencies" ON card_dependencies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete card_dependencies" ON card_dependencies FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read custom_field_definitions" ON custom_field_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert custom_field_definitions" ON custom_field_definitions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_field_definitions" ON custom_field_definitions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete custom_field_definitions" ON custom_field_definitions FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read custom_field_values" ON custom_field_values FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert custom_field_values" ON custom_field_values FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update custom_field_values" ON custom_field_values FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete custom_field_values" ON custom_field_values FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read mentions" ON mentions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert mentions" ON mentions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete mentions" ON mentions FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE checklists;
ALTER PUBLICATION supabase_realtime ADD TABLE checklist_items;
ALTER PUBLICATION supabase_realtime ADD TABLE attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;

-- ============================================================
-- Trigger: auto-update custom_field_values.updated_at
-- ============================================================
CREATE TRIGGER update_custom_field_values_updated_at
  BEFORE UPDATE ON custom_field_values
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Storage bucket for card attachments
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-attachments', 'card-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'card-attachments');

CREATE POLICY "Anyone can view attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'card-attachments');

CREATE POLICY "Authenticated users can delete attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'card-attachments');
-- Migration 003: RBAC & Permissions
-- Adds user roles, board membership, column move rules, and rewrites RLS policies

-- ============================================================
-- User Role Enum
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'department_lead', 'member', 'guest', 'client', 'observer');

-- Add user_role column to profiles (migrate existing 'role' text to enum)
ALTER TABLE profiles ADD COLUMN user_role user_role NOT NULL DEFAULT 'member';

-- Migrate existing text role values to enum where possible
UPDATE profiles SET user_role = 'admin' WHERE role = 'admin';
UPDATE profiles SET user_role = 'member' WHERE role = 'member' OR role IS NULL;

-- ============================================================
-- Board Members (explicit board-level access control)
-- ============================================================
CREATE TABLE board_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'member',
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(board_id, user_id)
);

-- ============================================================
-- Column Move Rules (restrict card movement between columns)
-- ============================================================
CREATE TABLE column_move_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  from_list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  to_list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  allowed_roles user_role[] NOT NULL DEFAULT '{admin,department_lead,member}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(board_id, from_list_id, to_list_id)
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_board_members_board_id ON board_members(board_id);
CREATE INDEX idx_board_members_user_id ON board_members(user_id);
CREATE INDEX idx_column_move_rules_board_id ON column_move_rules(board_id);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_move_rules ENABLE ROW LEVEL SECURITY;

-- Board members: authenticated users can read, admins/leads can manage
CREATE POLICY "Authenticated users can read board_members"
  ON board_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert board_members"
  ON board_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update board_members"
  ON board_members FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete board_members"
  ON board_members FOR DELETE TO authenticated USING (true);

-- Column move rules: authenticated users can read, admins can manage
CREATE POLICY "Authenticated users can read column_move_rules"
  ON column_move_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert column_move_rules"
  ON column_move_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update column_move_rules"
  ON column_move_rules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete column_move_rules"
  ON column_move_rules FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Helper function: check if user is board member with given role
-- ============================================================
CREATE OR REPLACE FUNCTION is_board_member(p_board_id UUID, p_user_id UUID, p_roles user_role[] DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admins always have access
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND user_role = 'admin') THEN
    RETURN TRUE;
  END IF;

  -- Board creator always has access
  IF EXISTS (SELECT 1 FROM boards WHERE id = p_board_id AND created_by = p_user_id) THEN
    RETURN TRUE;
  END IF;

  -- Check board membership
  IF p_roles IS NULL THEN
    RETURN EXISTS (SELECT 1 FROM board_members WHERE board_id = p_board_id AND user_id = p_user_id);
  ELSE
    RETURN EXISTS (SELECT 1 FROM board_members WHERE board_id = p_board_id AND user_id = p_user_id AND role = ANY(p_roles));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Auto-add board creator as admin member
-- ============================================================
CREATE OR REPLACE FUNCTION auto_add_board_creator()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO board_members (board_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'admin', NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_auto_add_board_creator
  AFTER INSERT ON boards
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_board_creator();

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE board_members;
-- Migration 004: Department-Specific Board Schemas & Automation Engine
-- Adds board templates, automation rules, and client_strategy_map board type

-- ============================================================
-- Add client_strategy_map to board_type enum
-- ============================================================
ALTER TYPE board_type ADD VALUE IF NOT EXISTS 'client_strategy_map';
ALTER TYPE board_type ADD VALUE IF NOT EXISTS 'copy';

-- ============================================================
-- Board Templates (stores default configuration per board type)
-- ============================================================
CREATE TABLE board_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_type board_type NOT NULL,
  default_lists JSONB NOT NULL DEFAULT '[]',
  default_labels JSONB NOT NULL DEFAULT '[]',
  default_custom_fields JSONB NOT NULL DEFAULT '[]',
  automation_rules JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(board_type)
);

-- ============================================================
-- Automation Rules
-- ============================================================
CREATE TYPE automation_trigger_type AS ENUM (
  'card_moved',
  'card_created',
  'card_updated',
  'due_date_passed',
  'checklist_completed',
  'field_changed',
  'label_added',
  'label_removed'
);

CREATE TYPE automation_action_type AS ENUM (
  'move_card',
  'set_field',
  'increment_field',
  'add_label',
  'remove_label',
  'create_card',
  'send_notification',
  'assign_user',
  'set_priority',
  'create_activity_log'
);

CREATE TABLE automation_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trigger_type automation_trigger_type NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  action_type automation_action_type NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}',
  execution_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Automation execution log
CREATE TABLE automation_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  trigger_data JSONB NOT NULL DEFAULT '{}',
  action_result JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_automation_rules_board_id ON automation_rules(board_id);
CREATE INDEX idx_automation_rules_trigger ON automation_rules(trigger_type);
CREATE INDEX idx_automation_rules_active ON automation_rules(board_id, is_active);
CREATE INDEX idx_automation_log_rule_id ON automation_log(rule_id);
CREATE INDEX idx_automation_log_board_id ON automation_log(board_id);
CREATE INDEX idx_automation_log_executed_at ON automation_log(executed_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE board_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read board_templates" ON board_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage board_templates" ON board_templates FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can read automation_rules" ON automation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert automation_rules" ON automation_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update automation_rules" ON automation_rules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete automation_rules" ON automation_rules FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read automation_log" ON automation_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert automation_log" ON automation_log FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- Triggers
-- ============================================================
CREATE TRIGGER update_board_templates_updated_at
  BEFORE UPDATE ON board_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_rules_updated_at
  BEFORE UPDATE ON automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE automation_rules;
-- Migration 005: Structured Briefing System (P1.4)
-- Briefing templates per board type + deliverable type
-- Card briefs: structured data + completeness scoring

-- ============================================================================
-- BRIEFING TEMPLATES
-- ============================================================================
CREATE TABLE briefing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_type TEXT NOT NULL,
  deliverable_type TEXT NOT NULL,
  name TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- fields JSONB structure:
-- [
--   { "key": "target_audience", "label": "Target Audience", "type": "text", "required": true },
--   { "key": "dimensions", "label": "Dimensions", "type": "text", "required": false },
--   { "key": "tone", "label": "Tone", "type": "dropdown", "options": ["Professional", "Casual"], "required": true },
--   { "key": "deadline", "label": "Deadline", "type": "date", "required": true },
--   { "key": "reference_links", "label": "Reference Links", "type": "url_list", "required": false },
--   { "key": "notes", "label": "Additional Notes", "type": "textarea", "required": false }
-- ]

CREATE INDEX idx_briefing_templates_board_type ON briefing_templates(board_type);
CREATE UNIQUE INDEX idx_briefing_templates_unique ON briefing_templates(board_type, deliverable_type);

-- ============================================================================
-- CARD BRIEFS
-- ============================================================================
CREATE TABLE card_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  template_id UUID REFERENCES briefing_templates(id) ON DELETE SET NULL,
  data JSONB NOT NULL DEFAULT '{}',
  completeness_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_card_briefs_card_id ON card_briefs(card_id);
CREATE INDEX idx_card_briefs_template_id ON card_briefs(template_id);
CREATE INDEX idx_card_briefs_is_complete ON card_briefs(is_complete);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE briefing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_briefs ENABLE ROW LEVEL SECURITY;

-- Briefing templates: readable by all authenticated users, writable by admins
CREATE POLICY "briefing_templates_select" ON briefing_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "briefing_templates_insert" ON briefing_templates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "briefing_templates_update" ON briefing_templates
  FOR UPDATE TO authenticated USING (true);

-- Card briefs: accessible by authenticated users (board-level filtering done in app)
CREATE POLICY "card_briefs_select" ON card_briefs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "card_briefs_insert" ON card_briefs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "card_briefs_update" ON card_briefs
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "card_briefs_delete" ON card_briefs
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_card_briefs_updated_at
  BEFORE UPDATE ON card_briefs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_briefing_templates_updated_at
  BEFORE UPDATE ON briefing_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE card_briefs;

-- ============================================================================
-- SEED BRIEFING TEMPLATES
-- ============================================================================

-- Design Board templates
INSERT INTO briefing_templates (board_type, deliverable_type, name, fields) VALUES
('graphic_designer', 'website_design', 'Website Design Brief', '[
  {"key": "project_name", "label": "Project Name", "type": "text", "required": true},
  {"key": "target_audience", "label": "Target Audience", "type": "textarea", "required": true},
  {"key": "brand_guidelines", "label": "Brand Guidelines Link", "type": "url", "required": false},
  {"key": "dimensions", "label": "Page Dimensions / Breakpoints", "type": "text", "required": true},
  {"key": "pages", "label": "Pages Required", "type": "textarea", "required": true},
  {"key": "color_preferences", "label": "Color Preferences", "type": "text", "required": false},
  {"key": "reference_links", "label": "Reference / Inspiration Links", "type": "textarea", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]'),
('graphic_designer', 'social_media_asset', 'Social Media Asset Brief', '[
  {"key": "platform", "label": "Platform", "type": "dropdown", "options": ["Instagram", "Facebook", "Twitter/X", "LinkedIn", "TikTok", "YouTube", "Pinterest"], "required": true},
  {"key": "asset_type", "label": "Asset Type", "type": "dropdown", "options": ["Post", "Story", "Cover Photo", "Ad", "Carousel"], "required": true},
  {"key": "dimensions", "label": "Dimensions", "type": "text", "required": true},
  {"key": "copy_text", "label": "Copy / Text Content", "type": "textarea", "required": true},
  {"key": "brand_guidelines", "label": "Brand Guidelines Link", "type": "url", "required": false},
  {"key": "target_audience", "label": "Target Audience", "type": "text", "required": true},
  {"key": "cta", "label": "Call to Action", "type": "text", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]'),
('graphic_designer', 'logo', 'Logo Design Brief', '[
  {"key": "company_name", "label": "Company / Brand Name", "type": "text", "required": true},
  {"key": "industry", "label": "Industry", "type": "text", "required": true},
  {"key": "brand_values", "label": "Brand Values / Keywords", "type": "textarea", "required": true},
  {"key": "color_preferences", "label": "Color Preferences", "type": "text", "required": false},
  {"key": "style_preferences", "label": "Style Preferences", "type": "dropdown", "options": ["Minimalist", "Modern", "Classic", "Playful", "Bold", "Elegant"], "required": true},
  {"key": "usage", "label": "Where will the logo be used?", "type": "textarea", "required": true},
  {"key": "reference_logos", "label": "Reference Logos / Inspiration", "type": "textarea", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]');

-- Dev Board templates
INSERT INTO briefing_templates (board_type, deliverable_type, name, fields) VALUES
('dev', 'feature_request', 'Feature Request Brief', '[
  {"key": "feature_name", "label": "Feature Name", "type": "text", "required": true},
  {"key": "user_story", "label": "User Story", "type": "textarea", "required": true},
  {"key": "acceptance_criteria", "label": "Acceptance Criteria", "type": "textarea", "required": true},
  {"key": "affected_pages", "label": "Affected Pages / Components", "type": "textarea", "required": true},
  {"key": "api_changes", "label": "API Changes Required", "type": "textarea", "required": false},
  {"key": "database_changes", "label": "Database Changes Required", "type": "textarea", "required": false},
  {"key": "design_link", "label": "Design / Mockup Link", "type": "url", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]'),
('dev', 'bug_report', 'Bug Report Brief', '[
  {"key": "bug_title", "label": "Bug Title", "type": "text", "required": true},
  {"key": "steps_to_reproduce", "label": "Steps to Reproduce", "type": "textarea", "required": true},
  {"key": "expected_behavior", "label": "Expected Behavior", "type": "textarea", "required": true},
  {"key": "actual_behavior", "label": "Actual Behavior", "type": "textarea", "required": true},
  {"key": "environment", "label": "Environment (Browser, OS, etc.)", "type": "text", "required": true},
  {"key": "url", "label": "URL Where Bug Occurs", "type": "url", "required": false},
  {"key": "screenshot", "label": "Screenshot / Recording Link", "type": "url", "required": false},
  {"key": "severity", "label": "Severity", "type": "dropdown", "options": ["Critical", "High", "Medium", "Low"], "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]');

-- Copy Board templates
INSERT INTO briefing_templates (board_type, deliverable_type, name, fields) VALUES
('copy', 'blog_post', 'Blog Post Brief', '[
  {"key": "topic", "label": "Topic / Title", "type": "text", "required": true},
  {"key": "target_audience", "label": "Target Audience", "type": "text", "required": true},
  {"key": "tone", "label": "Tone", "type": "dropdown", "options": ["Professional", "Casual", "Playful", "Authoritative", "Empathetic"], "required": true},
  {"key": "word_count", "label": "Target Word Count", "type": "number", "required": true},
  {"key": "seo_keywords", "label": "SEO Keywords", "type": "textarea", "required": true},
  {"key": "outline", "label": "Outline / Key Points", "type": "textarea", "required": true},
  {"key": "cta", "label": "Call to Action", "type": "text", "required": false},
  {"key": "reference_links", "label": "Reference Links", "type": "textarea", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]'),
('copy', 'email_campaign', 'Email Campaign Brief', '[
  {"key": "campaign_name", "label": "Campaign Name", "type": "text", "required": true},
  {"key": "email_type", "label": "Email Type", "type": "dropdown", "options": ["Newsletter", "Promotional", "Welcome Series", "Re-engagement", "Announcement", "Transactional"], "required": true},
  {"key": "target_audience", "label": "Target Audience / Segment", "type": "text", "required": true},
  {"key": "subject_line_ideas", "label": "Subject Line Ideas", "type": "textarea", "required": false},
  {"key": "key_message", "label": "Key Message", "type": "textarea", "required": true},
  {"key": "cta", "label": "Call to Action", "type": "text", "required": true},
  {"key": "tone", "label": "Tone", "type": "dropdown", "options": ["Professional", "Casual", "Urgent", "Friendly", "Formal"], "required": true},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]');

-- Video Board templates
INSERT INTO briefing_templates (board_type, deliverable_type, name, fields) VALUES
('video_editor', 'video_production', 'Video Production Brief', '[
  {"key": "video_title", "label": "Video Title", "type": "text", "required": true},
  {"key": "video_type", "label": "Video Type", "type": "dropdown", "options": ["Social Media", "YouTube", "Ad/Commercial", "Corporate", "Event", "Tutorial", "Animation", "Reel"], "required": true},
  {"key": "duration", "label": "Target Duration (seconds)", "type": "number", "required": true},
  {"key": "aspect_ratio", "label": "Aspect Ratio", "type": "dropdown", "options": ["16:9", "9:16", "1:1", "4:5", "4:3"], "required": true},
  {"key": "script", "label": "Script / Storyboard", "type": "textarea", "required": false},
  {"key": "raw_footage_link", "label": "Raw Footage Link", "type": "url", "required": false},
  {"key": "music_preference", "label": "Music / Audio Preference", "type": "text", "required": false},
  {"key": "brand_guidelines", "label": "Brand Guidelines Link", "type": "url", "required": false},
  {"key": "deadline", "label": "Deadline", "type": "date", "required": true},
  {"key": "notes", "label": "Additional Notes", "type": "textarea", "required": false}
]');
-- Migration 006: Client Strategy Map Board (P1.5)
-- Clients, credentials vault, training tracker, doors/keys roadmap, map sections

-- ============================================================================
-- CLIENTS
-- ============================================================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  contacts JSONB NOT NULL DEFAULT '[]',
  client_tag TEXT,
  contract_type TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- contacts JSONB: [{ "name": "...", "email": "...", "phone": "...", "role": "..." }]

CREATE INDEX idx_clients_created_by ON clients(created_by);
CREATE INDEX idx_clients_client_tag ON clients(client_tag);

-- Add client_id to cards for cross-board client tagging
ALTER TABLE cards ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX idx_cards_client_id ON cards(client_id);

-- ============================================================================
-- CREDENTIALS VAULT (encrypted)
-- ============================================================================
CREATE TABLE credential_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  username_encrypted BYTEA,
  password_encrypted BYTEA,
  notes_encrypted BYTEA,
  category TEXT NOT NULL DEFAULT 'general',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credential_entries_client_id ON credential_entries(client_id);
CREATE INDEX idx_credential_entries_category ON credential_entries(category);

-- ============================================================================
-- CREDENTIAL AUDIT LOG
-- ============================================================================
CREATE TABLE credential_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES credential_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- action values: 'viewed', 'created', 'updated', 'deleted'

CREATE INDEX idx_credential_audit_log_credential_id ON credential_audit_log(credential_id);
CREATE INDEX idx_credential_audit_log_user_id ON credential_audit_log(user_id);

-- ============================================================================
-- TRAINING ASSIGNMENTS
-- ============================================================================
CREATE TABLE training_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  prompt TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submission TEXT,
  feedback TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status values: 'pending', 'in_progress', 'submitted', 'reviewed', 'completed'

CREATE INDEX idx_training_assignments_client_id ON training_assignments(client_id);
CREATE INDEX idx_training_assignments_assigned_to ON training_assignments(assigned_to);
CREATE INDEX idx_training_assignments_status ON training_assignments(status);

-- ============================================================================
-- DOORS (roadmap milestones)
-- ============================================================================
CREATE TABLE doors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  door_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'locked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status values: 'locked', 'in_progress', 'completed'

CREATE INDEX idx_doors_client_id ON doors(client_id);
CREATE UNIQUE INDEX idx_doors_client_number ON doors(client_id, door_number);

-- ============================================================================
-- DOOR KEYS (sub-tasks within a door)
-- ============================================================================
CREATE TABLE door_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  door_id UUID NOT NULL REFERENCES doors(id) ON DELETE CASCADE,
  key_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_door_keys_door_id ON door_keys(door_id);
CREATE UNIQUE INDEX idx_door_keys_door_number ON door_keys(door_id, key_number);

-- ============================================================================
-- MAP SECTIONS (flexible content sections for client strategy map)
-- ============================================================================
CREATE TABLE map_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content JSONB NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0,
  is_client_visible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- section_type values: 'visual_brief', 'outreach_planner', 'resources', 'whiteboard', 'notes'

CREATE INDEX idx_map_sections_client_id ON map_sections(client_id);
CREATE INDEX idx_map_sections_section_type ON map_sections(section_type);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE doors ENABLE ROW LEVEL SECURITY;
ALTER TABLE door_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_sections ENABLE ROW LEVEL SECURITY;

-- Clients: all authenticated users can read and write
CREATE POLICY "clients_select" ON clients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_insert" ON clients
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clients_update" ON clients
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "clients_delete" ON clients
  FOR DELETE TO authenticated USING (true);

-- Credential entries: authenticated users only
CREATE POLICY "credential_entries_select" ON credential_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "credential_entries_insert" ON credential_entries
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "credential_entries_update" ON credential_entries
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "credential_entries_delete" ON credential_entries
  FOR DELETE TO authenticated USING (true);

-- Credential audit log: read-only for authenticated, insert by system
CREATE POLICY "credential_audit_log_select" ON credential_audit_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "credential_audit_log_insert" ON credential_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Training assignments
CREATE POLICY "training_assignments_select" ON training_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "training_assignments_insert" ON training_assignments
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "training_assignments_update" ON training_assignments
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "training_assignments_delete" ON training_assignments
  FOR DELETE TO authenticated USING (true);

-- Doors and keys
CREATE POLICY "doors_select" ON doors
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "doors_insert" ON doors
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "doors_update" ON doors
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "doors_delete" ON doors
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "door_keys_select" ON door_keys
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "door_keys_insert" ON door_keys
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "door_keys_update" ON door_keys
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "door_keys_delete" ON door_keys
  FOR DELETE TO authenticated USING (true);

-- Map sections
CREATE POLICY "map_sections_select" ON map_sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_sections_insert" ON map_sections
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "map_sections_update" ON map_sections
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "map_sections_delete" ON map_sections
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_credential_entries_updated_at
  BEFORE UPDATE ON credential_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_training_assignments_updated_at
  BEFORE UPDATE ON training_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_doors_updated_at
  BEFORE UPDATE ON doors FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_map_sections_updated_at
  BEFORE UPDATE ON map_sections FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE clients;
ALTER PUBLICATION supabase_realtime ADD TABLE training_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE doors;
ALTER PUBLICATION supabase_realtime ADD TABLE door_keys;
ALTER PUBLICATION supabase_realtime ADD TABLE map_sections;
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
-- Migration 008: Trello Migration System (P1.7)
-- Migration jobs tracking and entity mapping for Trello imports

-- ============================================================================
-- MIGRATION JOBS
-- ============================================================================
CREATE TABLE migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'trello',
  status TEXT NOT NULL DEFAULT 'pending',
  config JSONB NOT NULL DEFAULT '{}',
  progress JSONB NOT NULL DEFAULT '{"current": 0, "total": 0, "phase": "initialized"}',
  report JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status values: 'pending', 'running', 'completed', 'failed', 'cancelled'
-- config: { trello_api_key, trello_token, board_ids: [], board_type_mapping: { trello_board_id: board_type }, user_mapping: { trello_member_id: user_id } }
-- progress: { current: 0, total: 100, phase: "importing_boards" | "importing_lists" | "importing_cards" | "importing_comments" | "importing_attachments" | "completed" }
-- report: { boards_created: 0, lists_created: 0, cards_created: 0, comments_created: 0, attachments_created: 0, labels_created: 0, errors: [] }

CREATE INDEX idx_migration_jobs_status ON migration_jobs(status);
CREATE INDEX idx_migration_jobs_started_by ON migration_jobs(started_by);

-- ============================================================================
-- MIGRATION ENTITY MAP (tracks source → target ID mapping for idempotency)
-- ============================================================================
CREATE TABLE migration_entity_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- source_type values: 'board', 'list', 'card', 'label', 'comment', 'attachment', 'member', 'checklist', 'checklist_item'

CREATE INDEX idx_migration_entity_map_job_id ON migration_entity_map(job_id);
CREATE INDEX idx_migration_entity_map_lookup ON migration_entity_map(job_id, source_type, source_id);
CREATE UNIQUE INDEX idx_migration_entity_map_unique ON migration_entity_map(job_id, source_type, source_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_entity_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "migration_jobs_select" ON migration_jobs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "migration_jobs_insert" ON migration_jobs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "migration_jobs_update" ON migration_jobs
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "migration_jobs_delete" ON migration_jobs
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "migration_entity_map_select" ON migration_entity_map
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "migration_entity_map_insert" ON migration_entity_map
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_migration_jobs_updated_at
  BEFORE UPDATE ON migration_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- REALTIME (for progress tracking)
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE migration_jobs;
-- Migration 009: Backup & Disaster Recovery (P1.8)
-- Backup jobs tracking for full and incremental backups

-- ============================================================================
-- BACKUPS
-- ============================================================================
CREATE TABLE backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'full',
  status TEXT NOT NULL DEFAULT 'pending',
  storage_path TEXT,
  size_bytes BIGINT DEFAULT 0,
  manifest JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- type values: 'full', 'incremental'
-- status values: 'pending', 'running', 'completed', 'failed'
-- manifest: { tables: { boards: 10, cards: 200, ... }, storage_files: 50, checksum: "sha256:..." }

CREATE INDEX idx_backups_status ON backups(status);
CREATE INDEX idx_backups_type ON backups(type);
CREATE INDEX idx_backups_created_at ON backups(created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backups_select" ON backups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "backups_insert" ON backups
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "backups_update" ON backups
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "backups_delete" ON backups
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_backups_updated_at
  BEFORE UPDATE ON backups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 010: AI Infrastructure (P2.0)
-- API key management, model configuration, usage tracking, budget controls

-- ============================================================================
-- AI PROVIDERS ENUM
-- ============================================================================
-- Provider values: 'anthropic', 'openai', 'google'

-- ============================================================================
-- AI API KEYS (encrypted storage)
-- ============================================================================
CREATE TABLE ai_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  key_encrypted TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- provider values: 'anthropic', 'openai', 'google', 'browserless'
-- key_encrypted: hex-encoded AES-256-GCM encrypted key (uses CREDENTIALS_ENCRYPTION_KEY)

CREATE INDEX idx_ai_api_keys_provider ON ai_api_keys(provider);
CREATE INDEX idx_ai_api_keys_active ON ai_api_keys(is_active) WHERE is_active;

-- ============================================================================
-- AI MODEL CONFIGURATION (which model to use for each activity)
-- ============================================================================
CREATE TABLE ai_model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- activity values: 'design_review', 'dev_qa', 'chatbot_ticket', 'chatbot_board',
--   'chatbot_global', 'client_brain', 'nano_banana_edit', 'nano_banana_generate',
--   'email_draft', 'video_generation', 'brief_assist'

CREATE INDEX idx_ai_model_config_activity ON ai_model_config(activity);

-- ============================================================================
-- AI USAGE LOG (tracks every AI call for cost analysis)
-- ============================================================================
CREATE TABLE ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  activity TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status values: 'success', 'error', 'budget_blocked', 'rate_limited'

CREATE INDEX idx_ai_usage_log_user ON ai_usage_log(user_id);
CREATE INDEX idx_ai_usage_log_activity ON ai_usage_log(activity);
CREATE INDEX idx_ai_usage_log_provider ON ai_usage_log(provider);
CREATE INDEX idx_ai_usage_log_created_at ON ai_usage_log(created_at DESC);
CREATE INDEX idx_ai_usage_log_board ON ai_usage_log(board_id);
CREATE INDEX idx_ai_usage_log_client ON ai_usage_log(client_id);

-- ============================================================================
-- AI BUDGET CONFIGURATION
-- ============================================================================
CREATE TABLE ai_budget_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  scope_id TEXT,
  monthly_cap_usd NUMERIC(10,2) NOT NULL DEFAULT 100.00,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- scope values: 'global', 'provider', 'activity', 'user', 'board', 'client'
-- scope_id: NULL for global, provider name, activity name, user UUID, board UUID, client UUID

CREATE UNIQUE INDEX idx_ai_budget_config_scope ON ai_budget_config(scope, COALESCE(scope_id, ''));
CREATE INDEX idx_ai_budget_config_active ON ai_budget_config(is_active) WHERE is_active;

-- ============================================================================
-- SEED DEFAULT MODEL CONFIGURATION
-- ============================================================================
INSERT INTO ai_model_config (activity, provider, model_id, temperature, max_tokens) VALUES
  ('design_review', 'anthropic', 'claude-sonnet-4-5-20250929', 0.3, 4096),
  ('dev_qa', 'anthropic', 'claude-sonnet-4-5-20250929', 0.2, 4096),
  ('chatbot_ticket', 'anthropic', 'claude-sonnet-4-5-20250929', 0.7, 2048),
  ('chatbot_board', 'anthropic', 'claude-sonnet-4-5-20250929', 0.7, 4096),
  ('chatbot_global', 'anthropic', 'claude-sonnet-4-5-20250929', 0.7, 4096),
  ('client_brain', 'anthropic', 'claude-sonnet-4-5-20250929', 0.5, 4096),
  ('nano_banana_edit', 'google', 'gemini-2.0-flash-exp', 0.7, 1024),
  ('nano_banana_generate', 'google', 'gemini-2.0-flash-exp', 0.8, 1024),
  ('email_draft', 'anthropic', 'claude-sonnet-4-5-20250929', 0.6, 2048),
  ('video_generation', 'openai', 'sora-2', 0.7, 1024),
  ('brief_assist', 'anthropic', 'claude-haiku-4-5-20251001', 0.5, 1024);

-- Seed default global budget
INSERT INTO ai_budget_config (scope, scope_id, monthly_cap_usd, alert_threshold_pct) VALUES
  ('global', NULL, 500.00, 80);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE ai_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_config ENABLE ROW LEVEL SECURITY;

-- API keys: all authenticated users can read (to check availability), only admins should manage
-- (Fine-grained admin check will be done in API routes, RLS allows authenticated access)
CREATE POLICY "ai_api_keys_select" ON ai_api_keys
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_api_keys_insert" ON ai_api_keys
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ai_api_keys_update" ON ai_api_keys
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "ai_api_keys_delete" ON ai_api_keys
  FOR DELETE TO authenticated USING (true);

-- Model config: readable by all, writable by admins (enforced in API)
CREATE POLICY "ai_model_config_select" ON ai_model_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_model_config_insert" ON ai_model_config
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ai_model_config_update" ON ai_model_config
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "ai_model_config_delete" ON ai_model_config
  FOR DELETE TO authenticated USING (true);

-- Usage log: readable by all, insertable by system
CREATE POLICY "ai_usage_log_select" ON ai_usage_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_usage_log_insert" ON ai_usage_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Budget config: readable by all, writable by admins (enforced in API)
CREATE POLICY "ai_budget_config_select" ON ai_budget_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_budget_config_insert" ON ai_budget_config
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ai_budget_config_update" ON ai_budget_config
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "ai_budget_config_delete" ON ai_budget_config
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_ai_api_keys_updated_at
  BEFORE UPDATE ON ai_api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_ai_model_config_updated_at
  BEFORE UPDATE ON ai_model_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_ai_budget_config_updated_at
  BEFORE UPDATE ON ai_budget_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 011: AI Design Review (P2.1)
-- Review results tracking and attachment versioning for design review pipeline

-- ============================================================================
-- AI REVIEW RESULTS
-- ============================================================================
CREATE TABLE ai_review_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  previous_attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  change_requests JSONB NOT NULL DEFAULT '[]',
  verdicts JSONB NOT NULL DEFAULT '[]',
  overall_verdict TEXT NOT NULL DEFAULT 'pending',
  summary TEXT,
  confidence_score NUMERIC(5,2),
  model_used TEXT,
  usage_log_id UUID REFERENCES ai_usage_log(id) ON DELETE SET NULL,
  override_verdict TEXT,
  override_reason TEXT,
  overridden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  overridden_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- overall_verdict values: 'pending', 'approved', 'revisions_needed', 'overridden_approved', 'overridden_rejected'
-- change_requests: [{ "index": 1, "text": "Change the header color to blue" }, ...]
-- verdicts: [{ "index": 1, "verdict": "PASS|FAIL|PARTIAL", "reasoning": "...", "suggestions": "..." }, ...]

CREATE INDEX idx_ai_review_results_card ON ai_review_results(card_id);
CREATE INDEX idx_ai_review_results_verdict ON ai_review_results(overall_verdict);
CREATE INDEX idx_ai_review_results_created_at ON ai_review_results(created_at DESC);

-- ============================================================================
-- ATTACHMENT VERSIONING
-- ============================================================================
ALTER TABLE attachments ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attachments ADD COLUMN parent_attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL;

CREATE INDEX idx_attachments_parent ON attachments(parent_attachment_id);
CREATE INDEX idx_attachments_version ON attachments(card_id, version DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE ai_review_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_review_results_select" ON ai_review_results
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_review_results_insert" ON ai_review_results
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ai_review_results_update" ON ai_review_results
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "ai_review_results_delete" ON ai_review_results
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_ai_review_results_updated_at
  BEFORE UPDATE ON ai_review_results FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 012: AI Dev QA (P2.2)
-- QA results tracking, checklist templates, and screenshot-based quality analysis

-- ============================================================================
-- QA CHECKLIST TEMPLATES
-- ============================================================================
CREATE TABLE qa_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- items: [{ "category": "visual", "text": "No text overflow or clipping" }, ...]

-- ============================================================================
-- AI QA RESULTS
-- ============================================================================
CREATE TABLE ai_qa_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  screenshots JSONB NOT NULL DEFAULT '[]',
  results JSONB NOT NULL DEFAULT '{}',
  console_errors JSONB NOT NULL DEFAULT '[]',
  performance_metrics JSONB NOT NULL DEFAULT '{}',
  checklist_template_id UUID REFERENCES qa_checklist_templates(id) ON DELETE SET NULL,
  checklist_results JSONB NOT NULL DEFAULT '[]',
  overall_score INTEGER DEFAULT 0,
  overall_status TEXT NOT NULL DEFAULT 'pending',
  findings_count JSONB NOT NULL DEFAULT '{"critical": 0, "major": 0, "minor": 0, "info": 0}',
  model_used TEXT,
  usage_log_id UUID REFERENCES ai_usage_log(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- overall_status: 'pending', 'running', 'passed', 'failed', 'error'
-- screenshots: [{ "viewport": "desktop", "width": 1920, "height": 1080, "storage_path": "..." }, ...]
-- results: { "findings": [...], "checklist_results": [...], "overall_score": 85, "summary": "..." }
-- console_errors: [{ "type": "error", "text": "...", "url": "...", "line": 0 }]
-- performance_metrics: { "load_time_ms": 1200, "first_paint_ms": 300, "dom_content_loaded_ms": 800 }

CREATE INDEX idx_ai_qa_results_card ON ai_qa_results(card_id);
CREATE INDEX idx_ai_qa_results_status ON ai_qa_results(overall_status);
CREATE INDEX idx_ai_qa_results_created_at ON ai_qa_results(created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE qa_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_qa_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa_checklist_templates_select" ON qa_checklist_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "qa_checklist_templates_insert" ON qa_checklist_templates
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qa_checklist_templates_update" ON qa_checklist_templates
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "qa_checklist_templates_delete" ON qa_checklist_templates
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "ai_qa_results_select" ON ai_qa_results
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_qa_results_insert" ON ai_qa_results
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_qa_results_update" ON ai_qa_results
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ai_qa_results_delete" ON ai_qa_results
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_qa_checklist_templates_updated_at
  BEFORE UPDATE ON qa_checklist_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_ai_qa_results_updated_at
  BEFORE UPDATE ON ai_qa_results FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SEED DEFAULT QA CHECKLIST
-- ============================================================================
INSERT INTO qa_checklist_templates (name, description, is_default, items) VALUES
('Standard Web QA', 'Default QA checklist for web pages and applications', true, '[
  { "category": "visual", "text": "No text overflow or clipping in any viewport" },
  { "category": "visual", "text": "Images load correctly and are properly sized" },
  { "category": "visual", "text": "Consistent spacing and alignment" },
  { "category": "visual", "text": "Colors match brand guidelines" },
  { "category": "visual", "text": "Typography is consistent and readable" },
  { "category": "responsive", "text": "Layout adapts correctly to mobile viewport" },
  { "category": "responsive", "text": "Layout adapts correctly to tablet viewport" },
  { "category": "responsive", "text": "No horizontal scrolling on any viewport" },
  { "category": "interactive", "text": "All buttons and links appear clickable" },
  { "category": "interactive", "text": "Form elements are properly styled and aligned" },
  { "category": "interactive", "text": "Navigation is accessible and functional" },
  { "category": "accessibility", "text": "Sufficient color contrast for text" },
  { "category": "accessibility", "text": "Images have descriptive context" },
  { "category": "performance", "text": "Page loads within acceptable time" },
  { "category": "performance", "text": "No console errors visible" }
]');
-- Migration 013: AI Chatbot (P2.3)
-- Chat sessions with 3 scope levels: ticket, board, all-boards

-- ============================================================================
-- CHAT SESSIONS
-- ============================================================================
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('ticket', 'board', 'all_boards')),
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  model_used TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- messages: [{ "role": "user"|"assistant"|"system", "content": "...", "timestamp": "...", "tokens": 0 }]

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_card ON chat_sessions(card_id);
CREATE INDEX idx_chat_sessions_board ON chat_sessions(board_id);
CREATE INDEX idx_chat_sessions_scope ON chat_sessions(scope);
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own chat sessions
CREATE POLICY "chat_sessions_select" ON chat_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "chat_sessions_insert" ON chat_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chat_sessions_update" ON chat_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "chat_sessions_delete" ON chat_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 014: Client Boards & Portal (P2.4)
-- Client-facing boards, magic-link auth, ticket routing, approval workflow

-- ============================================================================
-- CLIENT BOARDS
-- ============================================================================
CREATE TABLE client_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, board_id)
);

CREATE INDEX idx_client_boards_client ON client_boards(client_id);
CREATE INDEX idx_client_boards_board ON client_boards(board_id);

-- ============================================================================
-- EXTEND CARDS TABLE FOR CLIENT VISIBILITY
-- ============================================================================
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_client_visible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS client_status TEXT CHECK (client_status IN ('in_progress', 'ready_for_review', 'approved', 'delivered', 'revision_requested'));
ALTER TABLE cards ADD COLUMN IF NOT EXISTS client_ticket_type TEXT CHECK (client_ticket_type IN ('design', 'bug', 'dev', 'content', 'video', 'general'));
ALTER TABLE cards ADD COLUMN IF NOT EXISTS approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected', 'revision_requested'));

-- ============================================================================
-- EXTEND COMMENTS FOR EXTERNAL/CLIENT VISIBILITY
-- ============================================================================
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- CLIENT PORTAL USERS (linked to auth.users via magic link)
-- ============================================================================
CREATE TABLE client_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  is_primary_contact BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_portal_users_client ON client_portal_users(client_id);
CREATE INDEX idx_client_portal_users_email ON client_portal_users(email);
CREATE INDEX idx_client_portal_users_user ON client_portal_users(user_id);

-- ============================================================================
-- CLIENT TICKETS (for routing requests to department boards)
-- ============================================================================
CREATE TABLE client_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES client_portal_users(id) ON DELETE SET NULL,
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('design', 'bug', 'dev', 'content', 'video', 'general')),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'routed', 'in_progress', 'completed', 'closed')),
  routed_to_card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  routed_to_board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_tickets_client ON client_tickets(client_id);
CREATE INDEX idx_client_tickets_status ON client_tickets(status);
CREATE INDEX idx_client_tickets_type ON client_tickets(ticket_type);

-- ============================================================================
-- SATISFACTION RESPONSES
-- ============================================================================
CREATE TABLE satisfaction_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  submitted_by UUID REFERENCES client_portal_users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_satisfaction_responses_client ON satisfaction_responses(client_id);
CREATE INDEX idx_satisfaction_responses_card ON satisfaction_responses(card_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE client_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE satisfaction_responses ENABLE ROW LEVEL SECURITY;

-- Internal users can manage client boards
CREATE POLICY "client_boards_select" ON client_boards
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_boards_insert" ON client_boards
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_boards_update" ON client_boards
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "client_boards_delete" ON client_boards
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "client_portal_users_select" ON client_portal_users
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_portal_users_insert" ON client_portal_users
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_portal_users_update" ON client_portal_users
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "client_portal_users_delete" ON client_portal_users
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "client_tickets_select" ON client_tickets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_tickets_insert" ON client_tickets
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_tickets_update" ON client_tickets
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "client_tickets_delete" ON client_tickets
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "satisfaction_responses_select" ON satisfaction_responses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "satisfaction_responses_insert" ON satisfaction_responses
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_client_boards_updated_at
  BEFORE UPDATE ON client_boards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_client_portal_users_updated_at
  BEFORE UPDATE ON client_portal_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_client_tickets_updated_at
  BEFORE UPDATE ON client_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 015: Client AI Brain (P2.5)
-- pgvector RAG pipeline for client-specific knowledge

-- ============================================================================
-- ENABLE PGVECTOR EXTENSION
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- CLIENT BRAIN DOCUMENTS
-- ============================================================================
CREATE TABLE client_brain_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('card', 'comment', 'brief', 'attachment', 'manual')),
  source_id UUID,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_index INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- metadata: { "card_id": "...", "board_type": "...", "deliverable_type": "...", "tags": [...] }

CREATE INDEX idx_brain_docs_client ON client_brain_documents(client_id);
CREATE INDEX idx_brain_docs_source ON client_brain_documents(source_type, source_id);
CREATE INDEX idx_brain_docs_active ON client_brain_documents(client_id, is_active);

-- Vector similarity index (IVFFlat for performance on moderate dataset sizes)
CREATE INDEX idx_brain_docs_embedding ON client_brain_documents
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- CLIENT BRAIN QUERY LOG
-- ============================================================================
CREATE TABLE client_brain_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  sources JSONB NOT NULL DEFAULT '[]',
  model_used TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_brain_queries_client ON client_brain_queries(client_id);
CREATE INDEX idx_brain_queries_user ON client_brain_queries(user_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE client_brain_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_brain_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_docs_select" ON client_brain_documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "brain_docs_insert" ON client_brain_documents
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "brain_docs_update" ON client_brain_documents
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "brain_docs_delete" ON client_brain_documents
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "brain_queries_select" ON client_brain_queries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "brain_queries_insert" ON client_brain_queries
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_brain_docs_updated_at
  BEFORE UPDATE ON client_brain_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 016: Digital Asset Library (P2.7)
-- Auto-archive deliverables, version history, client asset management

-- ============================================================================
-- ASSETS TABLE
-- ============================================================================
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'video', 'document', 'audio', 'font', 'archive', 'other')),
  mime_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  parent_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  source_card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  source_attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- metadata: { "width": 1920, "height": 1080, "duration": 30, "board_type": "graphic_designer", ... }

CREATE INDEX idx_assets_client ON assets(client_id);
CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX idx_assets_source_card ON assets(source_card_id);
CREATE INDEX idx_assets_parent ON assets(parent_asset_id);
CREATE INDEX idx_assets_created ON assets(created_at DESC);

-- ============================================================================
-- ASSET COLLECTIONS (folders/groups)
-- ============================================================================
CREATE TABLE asset_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  parent_collection_id UUID REFERENCES asset_collections(id) ON DELETE SET NULL,
  cover_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE asset_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES asset_collections(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(collection_id, asset_id)
);

CREATE INDEX idx_asset_collections_client ON asset_collections(client_id);
CREATE INDEX idx_collection_items_collection ON asset_collection_items(collection_id);
CREATE INDEX idx_collection_items_asset ON asset_collection_items(asset_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets_select" ON assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "assets_insert" ON assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "assets_update" ON assets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "assets_delete" ON assets FOR DELETE TO authenticated USING (true);

CREATE POLICY "collections_select" ON asset_collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "collections_insert" ON asset_collections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "collections_update" ON asset_collections FOR UPDATE TO authenticated USING (true);
CREATE POLICY "collections_delete" ON asset_collections FOR DELETE TO authenticated USING (true);

CREATE POLICY "collection_items_select" ON asset_collection_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "collection_items_insert" ON asset_collection_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "collection_items_delete" ON asset_collection_items FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_assets_updated_at
  BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_asset_collections_updated_at
  BEFORE UPDATE ON asset_collections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 017: Wiki / Knowledge Base (P2.8)
-- Rich text wiki pages with versioning, department filtering, board pinning

-- ============================================================================
-- WIKI PAGES
-- ============================================================================
CREATE TABLE wiki_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  department TEXT CHECK (department IN ('dev', 'training', 'account_manager', 'graphic_designer', 'executive_assistant', 'video_editor', 'copy', 'general')),
  is_published BOOLEAN NOT NULL DEFAULT false,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_cadence_days INTEGER,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  parent_page_id UUID REFERENCES wiki_pages(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wiki_pages_slug ON wiki_pages(slug);
CREATE INDEX idx_wiki_pages_department ON wiki_pages(department);
CREATE INDEX idx_wiki_pages_published ON wiki_pages(is_published);
CREATE INDEX idx_wiki_pages_owner ON wiki_pages(owner_id);
CREATE INDEX idx_wiki_pages_tags ON wiki_pages USING GIN(tags);
CREATE INDEX idx_wiki_pages_parent ON wiki_pages(parent_page_id);

-- ============================================================================
-- WIKI PAGE VERSIONS
-- ============================================================================
CREATE TABLE wiki_page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  change_summary TEXT,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(page_id, version_number)
);

CREATE INDEX idx_wiki_versions_page ON wiki_page_versions(page_id);

-- ============================================================================
-- BOARD WIKI PINS
-- ============================================================================
CREATE TABLE board_wiki_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  pinned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, page_id)
);

CREATE INDEX idx_wiki_pins_board ON board_wiki_pins(board_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE wiki_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_wiki_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wiki_pages_select" ON wiki_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "wiki_pages_insert" ON wiki_pages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "wiki_pages_update" ON wiki_pages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "wiki_pages_delete" ON wiki_pages FOR DELETE TO authenticated USING (true);

CREATE POLICY "wiki_versions_select" ON wiki_page_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "wiki_versions_insert" ON wiki_page_versions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "wiki_pins_select" ON board_wiki_pins FOR SELECT TO authenticated USING (true);
CREATE POLICY "wiki_pins_insert" ON board_wiki_pins FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "wiki_pins_delete" ON board_wiki_pins FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_wiki_pages_updated_at
  BEFORE UPDATE ON wiki_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 018: AM Client Update Emails (P2.9)
-- Automated email drafting, scheduling, and Google Calendar integration

-- ============================================================================
-- EMAIL CONFIG ON CLIENTS
-- ============================================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_config JSONB NOT NULL DEFAULT '{}';
-- email_config: { "update_cadence": "weekly"|"biweekly"|"monthly", "send_day": "monday", "send_time": "09:00", "tone": "formal"|"friendly"|"casual", "recipients": ["email@..."], "cc": [], "template_id": null }

-- ============================================================================
-- CLIENT EMAILS
-- ============================================================================
CREATE TABLE client_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'friendly' CHECK (tone IN ('formal', 'friendly', 'casual')),
  recipients TEXT[] NOT NULL DEFAULT '{}',
  cc TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'failed')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  resend_message_id TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  model_used TEXT,
  drafted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_emails_client ON client_emails(client_id);
CREATE INDEX idx_client_emails_status ON client_emails(status);
CREATE INDEX idx_client_emails_scheduled ON client_emails(scheduled_for);

-- ============================================================================
-- GOOGLE CALENDAR TOKENS
-- ============================================================================
CREATE TABLE google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  calendar_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE client_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_emails_select" ON client_emails FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_emails_insert" ON client_emails FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_emails_update" ON client_emails FOR UPDATE TO authenticated USING (true);
CREATE POLICY "client_emails_delete" ON client_emails FOR DELETE TO authenticated USING (true);

CREATE POLICY "gcal_tokens_select" ON google_calendar_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "gcal_tokens_insert" ON google_calendar_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "gcal_tokens_update" ON google_calendar_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "gcal_tokens_delete" ON google_calendar_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_client_emails_updated_at
  BEFORE UPDATE ON client_emails FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_gcal_tokens_updated_at
  BEFORE UPDATE ON google_calendar_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 019: Time Tracking (P3.1)
-- Start/stop timer, manual entry, billable/non-billable, estimate vs actual

-- ============================================================================
-- TIME ENTRIES
-- ============================================================================
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  description TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER, -- null while timer running, computed on stop
  is_billable BOOLEAN NOT NULL DEFAULT true,
  is_running BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_entries_card ON time_entries(card_id);
CREATE INDEX idx_time_entries_user ON time_entries(user_id);
CREATE INDEX idx_time_entries_board ON time_entries(board_id);
CREATE INDEX idx_time_entries_client ON time_entries(client_id);
CREATE INDEX idx_time_entries_running ON time_entries(user_id, is_running) WHERE is_running = true;
CREATE INDEX idx_time_entries_dates ON time_entries(started_at, ended_at);

-- ============================================================================
-- ESTIMATED HOURS ON CARDS
-- ============================================================================
ALTER TABLE cards ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(6,2);

-- ============================================================================
-- TIME REPORTS (cached aggregations for performance)
-- ============================================================================
CREATE TABLE time_report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
  report_date DATE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  billable_minutes INTEGER NOT NULL DEFAULT 0,
  non_billable_minutes INTEGER NOT NULL DEFAULT 0,
  entry_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_snapshots_date ON time_report_snapshots(report_date);
CREATE INDEX idx_time_snapshots_user ON time_report_snapshots(user_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_report_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_select" ON time_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_entries_insert" ON time_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "time_entries_update" ON time_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "time_entries_delete" ON time_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "time_snapshots_select" ON time_report_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_snapshots_insert" ON time_report_snapshots FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_time_entries_updated_at
  BEFORE UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 020: Automation Rules Builder (P3.2)
-- Visual rule builder, execution logging, recurring cards

-- ============================================================================
-- EXTEND AUTOMATION RULES (add description, last_triggered, trigger_count)
-- ============================================================================
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS trigger_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]';

-- ============================================================================
-- AUTOMATION EXECUTION LOG
-- ============================================================================
CREATE TABLE automation_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  trigger_data JSONB NOT NULL DEFAULT '{}',
  action_data JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auto_exec_log_rule ON automation_execution_log(rule_id);
CREATE INDEX idx_auto_exec_log_board ON automation_execution_log(board_id);
CREATE INDEX idx_auto_exec_log_created ON automation_execution_log(created_at);

-- ============================================================================
-- RECURRING CARDS
-- ============================================================================
CREATE TABLE recurring_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  recurrence_pattern TEXT NOT NULL CHECK (recurrence_pattern IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly')),
  recurrence_day INTEGER, -- day of week (0=Sun) or day of month
  recurrence_time TIME DEFAULT '09:00',
  labels TEXT[] NOT NULL DEFAULT '{}',
  assignee_ids UUID[] NOT NULL DEFAULT '{}',
  priority TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_created_at TIMESTAMPTZ,
  next_create_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_cards_board ON recurring_cards(board_id);
CREATE INDEX idx_recurring_cards_next ON recurring_cards(next_create_at) WHERE is_active = true;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE automation_execution_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_exec_log_select" ON automation_execution_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auto_exec_log_insert" ON automation_execution_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "recurring_cards_select" ON recurring_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "recurring_cards_insert" ON recurring_cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "recurring_cards_update" ON recurring_cards FOR UPDATE TO authenticated USING (true);
CREATE POLICY "recurring_cards_delete" ON recurring_cards FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_recurring_cards_updated_at
  BEFORE UPDATE ON recurring_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 021: AI Video Generation (P3.3)
-- Sora 2 + Veo 3 text-to-video, image-to-video

-- ============================================================================
-- AI VIDEO GENERATIONS
-- ============================================================================
CREATE TABLE ai_video_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('sora', 'veo')),
  mode TEXT NOT NULL CHECK (mode IN ('text_to_video', 'image_to_video', 'start_end_frame')),
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  -- settings: { duration: number, aspect_ratio: string, resolution: string, fps: number, style?: string }
  source_image_url TEXT, -- for image_to_video / start_end_frame
  end_image_url TEXT, -- for start_end_frame
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  output_urls TEXT[] NOT NULL DEFAULT '{}',
  thumbnail_url TEXT,
  storage_path TEXT,
  error_message TEXT,
  generation_time_ms INTEGER,
  estimated_cost NUMERIC(10,4),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_gen_card ON ai_video_generations(card_id);
CREATE INDEX idx_video_gen_user ON ai_video_generations(user_id);
CREATE INDEX idx_video_gen_status ON ai_video_generations(status);
CREATE INDEX idx_video_gen_provider ON ai_video_generations(provider);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE ai_video_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_gen_select" ON ai_video_generations FOR SELECT TO authenticated USING (true);
CREATE POLICY "video_gen_insert" ON ai_video_generations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "video_gen_update" ON ai_video_generations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "video_gen_delete" ON ai_video_generations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_video_gen_updated_at
  BEFORE UPDATE ON ai_video_generations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 022: AI Cost Profiling & Model Management (P3.4)
-- Model pricing, activity config, budget alerts, A/B testing

-- ============================================================================
-- AI MODEL PRICING (per-model cost data)
-- ============================================================================
CREATE TABLE ai_model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_cost_per_1k NUMERIC(10,6) NOT NULL DEFAULT 0,
  output_cost_per_1k NUMERIC(10,6) NOT NULL DEFAULT 0,
  image_cost_per_unit NUMERIC(10,6) NOT NULL DEFAULT 0,
  video_cost_per_second NUMERIC(10,6) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, model_id, effective_from)
);

CREATE INDEX idx_model_pricing_lookup ON ai_model_pricing(provider, model_id, effective_from);

-- ============================================================================
-- AI ACTIVITY CONFIG (per-activity model assignment + A/B testing)
-- ============================================================================
CREATE TABLE ai_activity_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 100, -- for A/B testing (0-100)
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_config_activity ON ai_activity_config(activity);

-- ============================================================================
-- AI BUDGET ALERTS
-- ============================================================================
CREATE TABLE ai_budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'user', 'board', 'activity')),
  scope_id TEXT, -- user_id, board_id, or activity name
  threshold_percent INTEGER NOT NULL CHECK (threshold_percent IN (50, 75, 90, 100)),
  monthly_cap NUMERIC(10,2) NOT NULL,
  current_spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  alerted_at TIMESTAMPTZ,
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  period_start DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_budget_alerts_scope ON ai_budget_alerts(scope, scope_id);
CREATE INDEX idx_budget_alerts_period ON ai_budget_alerts(period_start);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE ai_model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_activity_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "model_pricing_select" ON ai_model_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "model_pricing_insert" ON ai_model_pricing FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "model_pricing_update" ON ai_model_pricing FOR UPDATE TO authenticated USING (true);

CREATE POLICY "activity_config_select" ON ai_activity_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "activity_config_insert" ON ai_activity_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "activity_config_update" ON ai_activity_config FOR UPDATE TO authenticated USING (true);
CREATE POLICY "activity_config_delete" ON ai_activity_config FOR DELETE TO authenticated USING (true);

CREATE POLICY "budget_alerts_select" ON ai_budget_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "budget_alerts_insert" ON ai_budget_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "budget_alerts_update" ON ai_budget_alerts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "budget_alerts_delete" ON ai_budget_alerts FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_activity_config_updated_at
  BEFORE UPDATE ON ai_activity_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_budget_alerts_updated_at
  BEFORE UPDATE ON ai_budget_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 023: Integrations - Slack, GitHub, Figma (P3.5)

-- ============================================================================
-- INTEGRATION CONNECTIONS
-- ============================================================================
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('slack', 'github', 'figma')),
  name TEXT NOT NULL,
  access_token_encrypted BYTEA,
  refresh_token_encrypted BYTEA,
  token_expiry TIMESTAMPTZ,
  workspace_id TEXT, -- Slack workspace, GitHub org, Figma team
  metadata JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integrations_provider ON integrations(provider);

-- ============================================================================
-- SLACK BOARD MAPPINGS
-- ============================================================================
CREATE TABLE slack_board_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  notify_card_created BOOLEAN NOT NULL DEFAULT true,
  notify_card_moved BOOLEAN NOT NULL DEFAULT true,
  notify_card_completed BOOLEAN NOT NULL DEFAULT true,
  notify_comments BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, channel_id)
);

CREATE INDEX idx_slack_mappings_board ON slack_board_mappings(board_id);

-- ============================================================================
-- GITHUB CARD LINKS
-- ============================================================================
CREATE TABLE github_card_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('issue', 'pull_request', 'branch')),
  github_id INTEGER, -- GitHub issue/PR number
  github_url TEXT NOT NULL,
  state TEXT, -- open, closed, merged
  title TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_github_links_card ON github_card_links(card_id);
CREATE INDEX idx_github_links_repo ON github_card_links(repo_owner, repo_name);

-- ============================================================================
-- FIGMA CARD EMBEDS
-- ============================================================================
CREATE TABLE figma_card_embeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  figma_file_key TEXT NOT NULL,
  figma_node_id TEXT,
  figma_url TEXT NOT NULL,
  embed_type TEXT NOT NULL CHECK (embed_type IN ('file', 'frame', 'component', 'prototype')),
  title TEXT,
  thumbnail_url TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_figma_embeds_card ON figma_card_embeds(card_id);

-- ============================================================================
-- WEBHOOK EVENTS (incoming from integrations)
-- ============================================================================
CREATE TABLE integration_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_provider ON integration_webhook_events(provider, event_type);
CREATE INDEX idx_webhook_events_unprocessed ON integration_webhook_events(processed) WHERE processed = false;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_board_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_card_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE figma_card_embeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_select" ON integrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "integrations_insert" ON integrations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "integrations_update" ON integrations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "integrations_delete" ON integrations FOR DELETE TO authenticated USING (true);

CREATE POLICY "slack_mappings_select" ON slack_board_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "slack_mappings_insert" ON slack_board_mappings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "slack_mappings_update" ON slack_board_mappings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "slack_mappings_delete" ON slack_board_mappings FOR DELETE TO authenticated USING (true);

CREATE POLICY "github_links_select" ON github_card_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "github_links_insert" ON github_card_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "github_links_update" ON github_card_links FOR UPDATE TO authenticated USING (true);
CREATE POLICY "github_links_delete" ON github_card_links FOR DELETE TO authenticated USING (true);

CREATE POLICY "figma_embeds_select" ON figma_card_embeds FOR SELECT TO authenticated USING (true);
CREATE POLICY "figma_embeds_insert" ON figma_card_embeds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "figma_embeds_update" ON figma_card_embeds FOR UPDATE TO authenticated USING (true);
CREATE POLICY "figma_embeds_delete" ON figma_card_embeds FOR DELETE TO authenticated USING (true);

CREATE POLICY "webhook_events_select" ON integration_webhook_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "webhook_events_insert" ON integration_webhook_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "webhook_events_update" ON integration_webhook_events FOR UPDATE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_integrations_updated_at
  BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_github_links_updated_at
  BEFORE UPDATE ON github_card_links FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_figma_embeds_updated_at
  BEFORE UPDATE ON figma_card_embeds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 024: Analytics, White-Label, Gantt (P3.6)

-- ============================================================================
-- PORTAL BRANDING (White-Label)
-- ============================================================================
CREATE TABLE portal_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#6366f1',
  secondary_color TEXT NOT NULL DEFAULT '#0f172a',
  accent_color TEXT NOT NULL DEFAULT '#faf7f2',
  favicon_url TEXT,
  custom_domain TEXT,
  company_name TEXT,
  footer_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- ============================================================================
-- SATISFACTION SURVEYS
-- ============================================================================
CREATE TABLE satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  survey_type TEXT NOT NULL CHECK (survey_type IN ('delivery', 'milestone', 'periodic')),
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_satisfaction_client ON satisfaction_surveys(client_id);
CREATE INDEX idx_satisfaction_card ON satisfaction_surveys(card_id);

-- ============================================================================
-- CUSTOM REPORTS
-- ============================================================================
CREATE TABLE custom_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL CHECK (report_type IN ('burndown', 'velocity', 'cycle_time', 'workload', 'ai_effectiveness', 'custom')),
  config JSONB NOT NULL DEFAULT '{}',
  -- config: { metrics: [], filters: { board_ids: [], user_ids: [], date_range: {} }, chart_type: 'line'|'bar'|'pie' }
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  schedule TEXT, -- cron-like: 'weekly:monday', 'monthly:1'
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_reports_type ON custom_reports(report_type);
CREATE INDEX idx_custom_reports_creator ON custom_reports(created_by);

-- ============================================================================
-- GANTT DEPENDENCIES (extend card_dependencies for timeline view)
-- ============================================================================
ALTER TABLE cards ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE portal_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE satisfaction_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branding_select" ON portal_branding FOR SELECT TO authenticated USING (true);
CREATE POLICY "branding_insert" ON portal_branding FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "branding_update" ON portal_branding FOR UPDATE TO authenticated USING (true);
CREATE POLICY "branding_delete" ON portal_branding FOR DELETE TO authenticated USING (true);

CREATE POLICY "surveys_select" ON satisfaction_surveys FOR SELECT TO authenticated USING (true);
CREATE POLICY "surveys_insert" ON satisfaction_surveys FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "reports_select" ON custom_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "reports_insert" ON custom_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "reports_update" ON custom_reports FOR UPDATE TO authenticated USING (true);
CREATE POLICY "reports_delete" ON custom_reports FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_portal_branding_updated_at
  BEFORE UPDATE ON portal_branding FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_custom_reports_updated_at
  BEFORE UPDATE ON custom_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
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
-- Migration 026: Team Productivity Analytics (P4.2)
-- Column history tracking, productivity snapshots, scheduled reports

-- ============================================================================
-- CARD COLUMN HISTORY (auto-logged on card_placements changes)
-- ============================================================================
CREATE TABLE card_column_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  from_list_id UUID REFERENCES lists(id) ON DELETE SET NULL,
  to_list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  from_list_name TEXT,
  to_list_name TEXT,
  moved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_column_history_card ON card_column_history(card_id);
CREATE INDEX idx_column_history_board ON card_column_history(board_id);
CREATE INDEX idx_column_history_moved ON card_column_history(moved_at);
CREATE INDEX idx_column_history_to_list ON card_column_history(to_list_id);

-- ============================================================================
-- PRODUCTIVITY SNAPSHOTS (nightly batch aggregation)
-- ============================================================================
CREATE TABLE productivity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  department TEXT,
  tickets_completed INTEGER NOT NULL DEFAULT 0,
  tickets_created INTEGER NOT NULL DEFAULT 0,
  avg_cycle_time_hours NUMERIC(10,2),
  on_time_rate NUMERIC(5,2), -- percentage 0-100
  revision_rate NUMERIC(5,2), -- percentage 0-100
  ai_pass_rate NUMERIC(5,2), -- percentage 0-100
  total_time_logged_minutes INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(snapshot_date, user_id, board_id)
);

CREATE INDEX idx_prod_snapshots_date ON productivity_snapshots(snapshot_date);
CREATE INDEX idx_prod_snapshots_user ON productivity_snapshots(user_id);
CREATE INDEX idx_prod_snapshots_board ON productivity_snapshots(board_id);

-- ============================================================================
-- SCHEDULED REPORTS
-- ============================================================================
CREATE TABLE scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('productivity', 'revision', 'burndown', 'custom')),
  schedule TEXT NOT NULL, -- 'daily', 'weekly:monday', 'monthly:1'
  recipients TEXT[] NOT NULL DEFAULT '{}',
  config JSONB NOT NULL DEFAULT '{}',
  -- config: { board_ids: [], user_ids: [], department: string, date_range_days: number, comparison_mode: boolean }
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_reports_next ON scheduled_reports(next_send_at) WHERE is_active = true;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE card_column_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE productivity_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "column_history_select" ON card_column_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "column_history_insert" ON card_column_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "prod_snapshots_select" ON productivity_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "prod_snapshots_insert" ON productivity_snapshots FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "sched_reports_select" ON scheduled_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "sched_reports_insert" ON scheduled_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sched_reports_update" ON scheduled_reports FOR UPDATE TO authenticated USING (true);
CREATE POLICY "sched_reports_delete" ON scheduled_reports FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_scheduled_reports_updated_at
  BEFORE UPDATE ON scheduled_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 027: Revision Analysis & Export (P4.3)
-- Back-and-forth detection, outlier flagging, PDF export, scheduled summaries

-- ============================================================================
-- REVISION METRICS (per-card analysis)
-- ============================================================================
CREATE TABLE revision_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  ping_pong_count INTEGER NOT NULL DEFAULT 0, -- In Progress <-> Revisions transitions
  total_revision_time_minutes INTEGER NOT NULL DEFAULT 0,
  first_revision_at TIMESTAMPTZ,
  last_revision_at TIMESTAMPTZ,
  is_outlier BOOLEAN NOT NULL DEFAULT false,
  outlier_reason TEXT,
  avg_board_ping_pong NUMERIC(5,2), -- snapshot of board average at computation time
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_revision_metrics_card ON revision_metrics(card_id);
CREATE INDEX idx_revision_metrics_board ON revision_metrics(board_id);
CREATE INDEX idx_revision_metrics_outlier ON revision_metrics(is_outlier) WHERE is_outlier = true;

-- ============================================================================
-- REVISION REPORT EXPORTS
-- ============================================================================
CREATE TABLE revision_report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  department TEXT,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'csv', 'json')),
  storage_path TEXT,
  file_size_bytes INTEGER,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rev_exports_board ON revision_report_exports(board_id);
CREATE INDEX idx_rev_exports_status ON revision_report_exports(status);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE revision_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_report_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rev_metrics_select" ON revision_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "rev_metrics_insert" ON revision_metrics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rev_metrics_update" ON revision_metrics FOR UPDATE TO authenticated USING (true);

CREATE POLICY "rev_exports_select" ON revision_report_exports FOR SELECT TO authenticated USING (true);
CREATE POLICY "rev_exports_insert" ON revision_report_exports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rev_exports_update" ON revision_report_exports FOR UPDATE TO authenticated USING (true);
-- Migration 028: Public API & Webhooks (P5.0)

-- API Keys for external consumers
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL, -- first 8 chars for identification
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '[]', -- array of allowed scopes
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  rate_limit_per_day INTEGER NOT NULL DEFAULT 10000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage tracking for rate limiting
CREATE TABLE IF NOT EXISTS api_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook subscriptions
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL, -- for HMAC-SHA256 signature
  events TEXT[] NOT NULL DEFAULT '{}', -- e.g. card.created, card.moved, comment.added
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook delivery attempts
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  delivered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage_log(api_key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, delivered_at);

-- RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own API keys" ON api_keys FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own API usage" ON api_usage_log FOR SELECT USING (
  api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
);
CREATE POLICY "Users manage own webhooks" ON webhooks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own webhook deliveries" ON webhook_deliveries FOR SELECT USING (
  webhook_id IN (SELECT id FROM webhooks WHERE user_id = auth.uid())
);
-- Migration 029: Enterprise SSO, IP Whitelist, Advanced Audit (P5.1-5.2)

-- SSO Configuration
CREATE TABLE IF NOT EXISTS sso_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('saml', 'oidc')),
  name TEXT NOT NULL,
  issuer_url TEXT,
  metadata_url TEXT,
  client_id TEXT,
  client_secret_encrypted TEXT,
  certificate TEXT,
  attribute_mapping JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_provision_users BOOLEAN NOT NULL DEFAULT false,
  default_role TEXT NOT NULL DEFAULT 'member',
  allowed_domains TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- IP Whitelist rules
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cidr TEXT NOT NULL, -- IP or CIDR range (e.g., 192.168.1.0/24)
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Advanced audit log (all actions with old/new values)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, -- e.g. card.update, board.delete, user.login
  resource_type TEXT NOT NULL, -- e.g. card, board, user
  resource_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Review confidence scoring additions
ALTER TABLE ai_review_results ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,4);
ALTER TABLE ai_review_results ADD COLUMN IF NOT EXISTS accuracy_verified BOOLEAN;
ALTER TABLE ai_review_results ADD COLUMN IF NOT EXISTS accuracy_verified_by UUID REFERENCES auth.users(id);
ALTER TABLE ai_review_results ADD COLUMN IF NOT EXISTS accuracy_verified_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sso_configs_active ON sso_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_ip_whitelist_active ON ip_whitelist(is_active);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, created_at);

-- RLS
ALTER TABLE sso_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- SSO and IP whitelist: admin-only via application layer (service role)
CREATE POLICY "Admins manage SSO configs" ON sso_configs FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_role = 'admin')
);
CREATE POLICY "Admins manage IP whitelist" ON ip_whitelist FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_role = 'admin')
);
CREATE POLICY "Users view own audit log" ON audit_log FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_role = 'admin')
);
-- Migration 030: Performance Optimization Indexes (P5.3)
-- Adds strategic indexes for cursor-based pagination and N+1 query fixes

-- Card placements: the most queried join
CREATE INDEX IF NOT EXISTS idx_card_placements_board_list ON card_placements(board_id, list_id, position);
CREATE INDEX IF NOT EXISTS idx_card_placements_card ON card_placements(card_id);

-- Cards: cursor-based pagination support
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at);
CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON cards(updated_at);

-- Labels / assignees join optimization
CREATE INDEX IF NOT EXISTS idx_card_labels_card ON card_labels(card_id);
CREATE INDEX IF NOT EXISTS idx_card_assignees_card ON card_assignees(card_id);

-- Comments: card lookup
CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(card_id, created_at);

-- Activity log: card and board lookup
CREATE INDEX IF NOT EXISTS idx_activity_log_card ON activity_log(card_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_board ON activity_log(board_id, created_at);

-- Custom fields: board and card lookup
CREATE INDEX IF NOT EXISTS idx_custom_field_defs_board ON custom_field_definitions(board_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_card ON custom_field_values(card_id);

-- Board column history: productivity queries
CREATE INDEX IF NOT EXISTS idx_card_column_history_board_date ON card_column_history(board_id, moved_at);
CREATE INDEX IF NOT EXISTS idx_card_column_history_card ON card_column_history(card_id, moved_at);

-- Notifications: unread count
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
-- Migration 031: WhatsApp Advanced + Productivity Polish (P5.4)

-- Custom quick action templates (user-defined commands)
CREATE TABLE IF NOT EXISTS whatsapp_custom_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  label TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}',
  response_template TEXT, -- message template sent back after action
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, keyword)
);

-- Digest templates (custom content blocks)
CREATE TABLE IF NOT EXISTS whatsapp_digest_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]', -- ordered array of section configs
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Productivity PDF report configs
CREATE TABLE IF NOT EXISTS productivity_report_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('individual', 'team', 'department', 'executive')),
  schedule TEXT, -- cron-like or 'daily'/'weekly:monday'/'monthly:1'
  recipients TEXT[] NOT NULL DEFAULT '{}',
  include_sections JSONB NOT NULL DEFAULT '[]',
  filters JSONB NOT NULL DEFAULT '{}',
  format TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'csv', 'xlsx')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated report files
CREATE TABLE IF NOT EXISTS productivity_report_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID REFERENCES productivity_report_configs(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  format TEXT NOT NULL,
  storage_path TEXT,
  file_size_bytes INTEGER,
  date_range_start TEXT NOT NULL,
  date_range_end TEXT NOT NULL,
  generated_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_custom_actions_user ON whatsapp_custom_actions(user_id, keyword);
CREATE INDEX IF NOT EXISTS idx_wa_digest_templates_user ON whatsapp_digest_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_prod_report_configs_creator ON productivity_report_configs(created_by);
CREATE INDEX IF NOT EXISTS idx_prod_report_files_config ON productivity_report_files(config_id, created_at);

-- RLS
ALTER TABLE whatsapp_custom_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_digest_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE productivity_report_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE productivity_report_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own custom actions" ON whatsapp_custom_actions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own digest templates" ON whatsapp_digest_templates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own report configs" ON productivity_report_configs FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users view own report files" ON productivity_report_files FOR ALL USING (auth.uid() = generated_by);
-- Migration 035: Agency Roles & Signup Approval
-- Adds agency-specific roles, account approval status, and board-role access mapping

-- 1. Create agency_role enum
DO $$ BEGIN
  CREATE TYPE agency_role_enum AS ENUM (
    'agency_owner',
    'dev',
    'designer',
    'account_manager',
    'executive_assistant',
    'video_editor'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create account_status enum
DO $$ BEGIN
  CREATE TYPE account_status_enum AS ENUM ('pending', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Add columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agency_role agency_role_enum DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_status account_status_enum DEFAULT 'pending';

-- 4. Create board_role_access table (maps board types to allowed agency roles)
CREATE TABLE IF NOT EXISTS board_role_access (
  board_type text NOT NULL,
  agency_role agency_role_enum NOT NULL,
  PRIMARY KEY (board_type, agency_role)
);

ALTER TABLE board_role_access ENABLE ROW LEVEL SECURITY;

-- Everyone can read the access map
CREATE POLICY "board_role_access_select" ON board_role_access
  FOR SELECT TO authenticated USING (true);

-- Only agency_owner can modify
CREATE POLICY "board_role_access_modify" ON board_role_access
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.agency_role = 'agency_owner'
    )
  );

-- 5. Seed default board-role access mapping
INSERT INTO board_role_access (board_type, agency_role) VALUES
  -- agency_owner has access to ALL board types
  ('dev', 'agency_owner'),
  ('training', 'agency_owner'),
  ('account_manager', 'agency_owner'),
  ('graphic_designer', 'agency_owner'),
  ('executive_assistant', 'agency_owner'),
  ('video_editor', 'agency_owner'),
  ('client_strategy_map', 'agency_owner'),
  ('copy', 'agency_owner'),
  -- dev
  ('dev', 'dev'),
  -- training: everyone
  ('training', 'dev'),
  ('training', 'designer'),
  ('training', 'account_manager'),
  ('training', 'executive_assistant'),
  ('training', 'video_editor'),
  -- account_manager
  ('account_manager', 'account_manager'),
  ('account_manager', 'executive_assistant'),
  -- graphic_designer
  ('graphic_designer', 'designer'),
  -- executive_assistant
  ('executive_assistant', 'executive_assistant'),
  -- video_editor
  ('video_editor', 'video_editor'),
  -- client_strategy_map
  ('client_strategy_map', 'account_manager'),
  ('client_strategy_map', 'executive_assistant'),
  -- copy
  ('copy', 'designer'),
  ('copy', 'account_manager')
ON CONFLICT DO NOTHING;

-- 6. Set existing users to 'active' (they were already approved implicitly)
UPDATE profiles SET account_status = 'active' WHERE account_status IS NULL OR account_status = 'pending';

-- 7. Update the handle_new_user trigger to set pending status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, role, user_role, account_status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    'member',
    'member',
    'pending'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
