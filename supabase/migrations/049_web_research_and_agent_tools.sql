-- Migration 049: Web Research Agent + Enhanced Agent Framework
-- Shared migration for both features

-- ============================================================================
-- WEB RESEARCH SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_research_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  task_type TEXT NOT NULL DEFAULT 'general'
    CHECK (task_type IN ('url_import','competitor_research','link_health',
                         'content_extraction','social_proof','general')),
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

-- ============================================================================
-- WEB RESEARCH TOOL CALLS (individual browsing actions)
-- ============================================================================

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

-- ============================================================================
-- RLS POLICIES FOR WEB RESEARCH
-- ============================================================================

ALTER TABLE web_research_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_research_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own research sessions"
  ON web_research_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own research sessions"
  ON web_research_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own research sessions"
  ON web_research_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own research sessions"
  ON web_research_sessions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view tool calls for their sessions"
  ON web_research_tool_calls FOR SELECT
  USING (
    session_id IN (SELECT id FROM web_research_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert tool calls for their sessions"
  ON web_research_tool_calls FOR INSERT
  WITH CHECK (
    session_id IN (SELECT id FROM web_research_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update tool calls for their sessions"
  ON web_research_tool_calls FOR UPDATE
  USING (
    session_id IN (SELECT id FROM web_research_sessions WHERE user_id = auth.uid())
  );

-- ============================================================================
-- AGENT FRAMEWORK ENHANCEMENTS
-- ============================================================================

-- Add multi-turn columns to agent_executions
ALTER TABLE agent_executions
  ADD COLUMN IF NOT EXISTS message_history JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS chain_step INT,
  ADD COLUMN IF NOT EXISTS tool_call_count INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_agent_executions_chain ON agent_executions(chain_id)
  WHERE chain_id IS NOT NULL;

-- ============================================================================
-- SERVICE ROLE POLICIES (for server-side operations)
-- ============================================================================

-- Allow service role full access to web research tables
CREATE POLICY "Service role full access to web_research_sessions"
  ON web_research_sessions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to web_research_tool_calls"
  ON web_research_tool_calls FOR ALL
  USING (auth.role() = 'service_role');
-- Migration 049: WhatsApp Business API Support
-- Part of Phase 9.2: WhatsApp Integration Enhancement
-- Schema: profiles.role uses user_role enum (admin,department_lead,member,guest,client,observer)

-- Add delivery status tracking columns to whatsapp_messages
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT CHECK (media_type IN ('image', 'video', 'document', 'audio'));

-- Unique index on external_id for idempotent webhook processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_external_id
  ON whatsapp_messages(external_id) WHERE external_id IS NOT NULL;

-- WhatsApp config table (API credentials, per-agency)
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

-- Only admin roles can view/modify config
DROP POLICY IF EXISTS "Admins can manage WhatsApp config" ON whatsapp_config;
CREATE POLICY "Admins can manage WhatsApp config"
  ON whatsapp_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );
