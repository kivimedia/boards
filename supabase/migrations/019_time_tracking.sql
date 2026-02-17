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
