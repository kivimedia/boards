-- ==========================================================================
-- Migration 043: Saved Filters + Tier B Schema
-- - saved_filters table for board filter presets
-- - approval_history table for client approval audit trail
-- - velocity_snapshots table for sprint velocity tracking
-- ==========================================================================

-- 1. SAVED FILTERS
CREATE TABLE IF NOT EXISTS saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filter_config JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_board_user ON saved_filters(board_id, user_id);
CREATE INDEX IF NOT EXISTS idx_saved_filters_board_shared ON saved_filters(board_id) WHERE is_shared = true;

ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own and shared filters" ON saved_filters
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_shared = true);

CREATE POLICY "Users can manage their own filters" ON saved_filters
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. APPROVAL HISTORY (audit trail for client approval workflows)
CREATE TABLE IF NOT EXISTS approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_history_card ON approval_history(card_id, created_at DESC);

ALTER TABLE approval_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view approval history" ON approval_history
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert approval history" ON approval_history
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());

-- 3. VELOCITY SNAPSHOTS (for burndown velocity metrics)
CREATE TABLE IF NOT EXISTS velocity_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  cards_completed INTEGER NOT NULL DEFAULT 0,
  cards_added INTEGER NOT NULL DEFAULT 0,
  avg_cycle_time_hours NUMERIC(10,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_velocity_board_period ON velocity_snapshots(board_id, period_end DESC);

ALTER TABLE velocity_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view velocity" ON velocity_snapshots
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert velocity" ON velocity_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (true);
