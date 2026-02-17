-- Migration 051: QA Monitoring Configs + Link Check Results
-- Part of Phase 9.4: AI QA Expansion
-- Schema: board_members.user_id, user_role enum (admin,department_lead,member,guest,client,observer)
-- Cards connect to boards via: card_placements.card_id -> card_placements.list_id -> lists.board_id

-- QA monitoring configuration (recurring checks on production URLs)
CREATE TABLE IF NOT EXISTS qa_monitoring_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  frequency TEXT DEFAULT '24h' CHECK (frequency IN ('12h', '24h', '48h', '7d')),
  browsers TEXT[] DEFAULT ARRAY['chrome'],
  alert_threshold NUMERIC DEFAULT 10,
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  last_scores JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_monitoring_active ON qa_monitoring_configs(is_active, last_run_at);
CREATE INDEX IF NOT EXISTS idx_qa_monitoring_board ON qa_monitoring_configs(board_id);

ALTER TABLE qa_monitoring_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view monitoring configs for their boards" ON qa_monitoring_configs;
CREATE POLICY "Users can view monitoring configs for their boards"
  ON qa_monitoring_configs FOR SELECT
  USING (
    board_id IN (
      SELECT board_id FROM board_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage monitoring configs for their boards" ON qa_monitoring_configs;
CREATE POLICY "Users can manage monitoring configs for their boards"
  ON qa_monitoring_configs FOR ALL
  USING (
    board_id IN (
      SELECT bm.board_id FROM board_members bm
      WHERE bm.user_id = auth.uid()
      AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

-- Link check results table
CREATE TABLE IF NOT EXISTS qa_link_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_result_id UUID REFERENCES ai_qa_results(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  link_type TEXT CHECK (link_type IN ('internal', 'external', 'anchor', 'mailto', 'tel')),
  is_broken BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_link_checks_result ON qa_link_checks(qa_result_id);
CREATE INDEX IF NOT EXISTS idx_qa_link_checks_broken ON qa_link_checks(qa_result_id, is_broken);

ALTER TABLE qa_link_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view link checks via QA results" ON qa_link_checks;
CREATE POLICY "Users can view link checks via QA results"
  ON qa_link_checks FOR SELECT
  USING (
    qa_result_id IN (
      SELECT qr.id FROM ai_qa_results qr
      JOIN card_placements cp ON cp.card_id = qr.card_id
      JOIN lists l ON l.id = cp.list_id
      JOIN board_members bm ON l.board_id = bm.board_id
      WHERE bm.user_id = auth.uid()
    )
  );
