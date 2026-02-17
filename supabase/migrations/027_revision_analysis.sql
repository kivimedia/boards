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
