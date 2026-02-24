-- ALL PENDING MIGRATIONS (FINAL CORRECTED VERSION)
-- Schema facts: board_members.user_id, user_role enum (admin,department_lead,member,guest,client,observer)
-- Cards connect to boards via: card_placements.card_id -> card_placements.list_id -> lists.board_id

-- Migration 044
ALTER TABLE pga_candidates ADD COLUMN IF NOT EXISTS location text;

-- Migration 045
ALTER TABLE pga_agent_runs ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;
ALTER TABLE pga_agent_runs DROP CONSTRAINT IF EXISTS pga_agent_runs_status_check;
ALTER TABLE pga_agent_runs ADD CONSTRAINT pga_agent_runs_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'awaiting_input'));
CREATE INDEX IF NOT EXISTS idx_pga_agent_runs_awaiting
  ON pga_agent_runs (agent_type, current_step) WHERE status = 'awaiting_input';
ALTER TABLE pga_integration_configs DROP CONSTRAINT IF EXISTS pga_integration_configs_service_check;
ALTER TABLE pga_integration_configs ADD CONSTRAINT pga_integration_configs_service_check
  CHECK (service IN ('instantly', 'hunter', 'snov', 'calendly', 'scout_config', 'trello'));
INSERT INTO pga_integration_configs (service, config, is_active)
VALUES (
  'scout_config',
  '{"default_query": "vibe coding freelancer agency AI tools", "default_location": "US", "custom_location": "", "tool_focus": "Cursor, Lovable, Bolt, Replit, v0, Windsurf", "max_results": 10}',
  true
) ON CONFLICT (service) DO NOTHING;

-- Migration 048: Productivity alerts
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
DROP POLICY IF EXISTS "Users can view alerts for their boards" ON productivity_alerts;
CREATE POLICY "Users can view alerts for their boards" ON productivity_alerts
  FOR SELECT USING (
    user_id = auth.uid()
    OR board_id IN (SELECT board_id FROM board_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Service role manages alerts" ON productivity_alerts;
CREATE POLICY "Service role manages alerts" ON productivity_alerts
  FOR ALL USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_productivity_snapshots_department
  ON productivity_snapshots(department, snapshot_date DESC) WHERE department IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_productivity_snapshots_user_board
  ON productivity_snapshots(user_id, board_id, snapshot_date DESC);

-- Migration 049a: Web Research Agent
CREATE TABLE IF NOT EXISTS web_research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  task_type TEXT NOT NULL DEFAULT 'general'
    CHECK (task_type IN ('url_import','competitor_research','link_health','content_extraction','social_proof','general')),
  input_prompt TEXT NOT NULL,
  input_urls TEXT[] DEFAULT '{}',
  domain_allowlist TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','cancelled')),
  current_iteration INT DEFAULT 0,
  max_iterations INT DEFAULT 15,
  output_summary TEXT,
  output_structured JSONB DEFAULT '{}',
  extracted_items JSONB DEFAULT '[]',
  screenshots_taken INT DEFAULT 0,
  pages_visited INT DEFAULT 0,
  ai_tokens_used INT DEFAULT 0,
  ai_cost_usd NUMERIC(10,6) DEFAULT 0,
  browser_seconds_used INT DEFAULT 0,
  browser_cost_usd NUMERIC(10,6) DEFAULT 0,
  total_cost_usd NUMERIC(10,6) DEFAULT 0,
  duration_ms INT,
  model_used TEXT,
  tool_calls_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_web_research_sessions_user ON web_research_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_web_research_sessions_board ON web_research_sessions(board_id);
CREATE INDEX IF NOT EXISTS idx_web_research_sessions_status ON web_research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_web_research_sessions_created ON web_research_sessions(created_at DESC);

CREATE TABLE IF NOT EXISTS web_research_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES web_research_sessions(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_input JSONB DEFAULT '{}',
  tool_result JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','success','failed')),
  error_message TEXT,
  duration_ms INT,
  call_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_web_research_tool_calls_session ON web_research_tool_calls(session_id);

ALTER TABLE web_research_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_research_tool_calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own research sessions" ON web_research_sessions;
CREATE POLICY "Users can view their own research sessions" ON web_research_sessions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert their own research sessions" ON web_research_sessions;
CREATE POLICY "Users can insert their own research sessions" ON web_research_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own research sessions" ON web_research_sessions;
CREATE POLICY "Users can update their own research sessions" ON web_research_sessions FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete their own research sessions" ON web_research_sessions;
CREATE POLICY "Users can delete their own research sessions" ON web_research_sessions FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view tool calls for their sessions" ON web_research_tool_calls;
CREATE POLICY "Users can view tool calls for their sessions" ON web_research_tool_calls FOR SELECT
  USING (session_id IN (SELECT id FROM web_research_sessions WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can insert tool calls for their sessions" ON web_research_tool_calls;
CREATE POLICY "Users can insert tool calls for their sessions" ON web_research_tool_calls FOR INSERT
  WITH CHECK (session_id IN (SELECT id FROM web_research_sessions WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Users can update tool calls for their sessions" ON web_research_tool_calls;
CREATE POLICY "Users can update tool calls for their sessions" ON web_research_tool_calls FOR UPDATE
  USING (session_id IN (SELECT id FROM web_research_sessions WHERE user_id = auth.uid()));

ALTER TABLE agent_executions
  ADD COLUMN IF NOT EXISTS message_history JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS chain_step INT,
  ADD COLUMN IF NOT EXISTS tool_call_count INT DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_agent_executions_chain ON agent_executions(chain_id) WHERE chain_id IS NOT NULL;

DROP POLICY IF EXISTS "Service role full access to web_research_sessions" ON web_research_sessions;
CREATE POLICY "Service role full access to web_research_sessions" ON web_research_sessions FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role full access to web_research_tool_calls" ON web_research_tool_calls;
CREATE POLICY "Service role full access to web_research_tool_calls" ON web_research_tool_calls FOR ALL USING (auth.role() = 'service_role');

-- Migration 049b: WhatsApp Business API
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image', 'video', 'document', 'audio'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_external_id
  ON whatsapp_messages(external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  webhook_verify_token TEXT NOT NULL,
  business_account_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage WhatsApp config" ON whatsapp_config;
CREATE POLICY "Admins can manage WhatsApp config" ON whatsapp_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Migration 050: Video design review
ALTER TABLE ai_review_results
  ADD COLUMN IF NOT EXISTS review_type TEXT DEFAULT 'image' CHECK (review_type IN ('image', 'video')),
  ADD COLUMN IF NOT EXISTS frame_count INTEGER,
  ADD COLUMN IF NOT EXISTS frame_verdicts JSONB,
  ADD COLUMN IF NOT EXISTS thumbnail_suggestion TEXT,
  ADD COLUMN IF NOT EXISTS video_duration_seconds NUMERIC;
CREATE INDEX IF NOT EXISTS idx_ai_review_results_type ON ai_review_results(review_type, created_at DESC);

-- Migration 051: QA Monitoring + Link Checks
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
CREATE POLICY "Users can view monitoring configs for their boards" ON qa_monitoring_configs
  FOR SELECT USING (
    board_id IN (SELECT board_id FROM board_members WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "Users can manage monitoring configs for their boards" ON qa_monitoring_configs;
CREATE POLICY "Users can manage monitoring configs for their boards" ON qa_monitoring_configs
  FOR ALL USING (
    board_id IN (
      SELECT bm.board_id FROM board_members bm
      WHERE bm.user_id = auth.uid()
      AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

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
CREATE POLICY "Users can view link checks via QA results" ON qa_link_checks
  FOR SELECT USING (
    qa_result_id IN (
      SELECT qr.id FROM ai_qa_results qr
      JOIN card_placements cp ON cp.card_id = qr.card_id
      JOIN lists l ON l.id = cp.list_id
      JOIN board_members bm ON l.board_id = bm.board_id
      WHERE bm.user_id = auth.uid()
    )
  );

SELECT 'ALL MIGRATIONS COMPLETE' as status;
