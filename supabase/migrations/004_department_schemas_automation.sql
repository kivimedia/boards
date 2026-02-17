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
