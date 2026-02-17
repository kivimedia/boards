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
