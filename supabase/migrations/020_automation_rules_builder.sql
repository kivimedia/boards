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
