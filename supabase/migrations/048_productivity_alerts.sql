-- Migration 048: Productivity alerts + department rollup support
-- Phase 9.1: Team Productivity Analytics completion

-- Productivity alerts table for anomaly detection
CREATE TABLE IF NOT EXISTS productivity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL CHECK (metric_name IN (
    'cycle_time', 'on_time_rate', 'revision_rate', 'ai_pass_rate',
    'tickets_completed', 'revision_outliers'
  )),
  current_value NUMERIC NOT NULL,
  threshold_value NUMERIC NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('above_threshold', 'below_threshold', 'trend_change')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES profiles(id),
  acknowledged_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productivity_alerts_board ON productivity_alerts(board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_productivity_alerts_user ON productivity_alerts(user_id, acknowledged);
CREATE INDEX IF NOT EXISTS idx_productivity_alerts_severity ON productivity_alerts(severity, acknowledged, created_at DESC);

ALTER TABLE productivity_alerts ENABLE ROW LEVEL SECURITY;

-- RLS: Users can see alerts for boards they're members of
CREATE POLICY "Users can view alerts for their boards" ON productivity_alerts
  FOR SELECT USING (
    user_id = auth.uid()
    OR board_id IN (
      SELECT board_id FROM board_members WHERE user_id = auth.uid()
    )
  );

-- Service role can insert/update (cron job uses service role)
CREATE POLICY "Service role manages alerts" ON productivity_alerts
  FOR ALL USING (auth.role() = 'service_role');

-- Add index on productivity_snapshots for department rollup queries
CREATE INDEX IF NOT EXISTS idx_productivity_snapshots_department
  ON productivity_snapshots(department, snapshot_date DESC)
  WHERE department IS NOT NULL;

-- Add index on productivity_snapshots for user-board aggregation
CREATE INDEX IF NOT EXISTS idx_productivity_snapshots_user_board
  ON productivity_snapshots(user_id, board_id, snapshot_date DESC);
