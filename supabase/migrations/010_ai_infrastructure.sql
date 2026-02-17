-- Migration 010: AI Infrastructure (P2.0)
-- API key management, model configuration, usage tracking, budget controls

-- ============================================================================
-- AI PROVIDERS ENUM
-- ============================================================================
-- Provider values: 'anthropic', 'openai', 'google'

-- ============================================================================
-- AI API KEYS (encrypted storage)
-- ============================================================================
CREATE TABLE ai_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  key_encrypted TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- provider values: 'anthropic', 'openai', 'google', 'browserless'
-- key_encrypted: hex-encoded AES-256-GCM encrypted key (uses CREDENTIALS_ENCRYPTION_KEY)

CREATE INDEX idx_ai_api_keys_provider ON ai_api_keys(provider);
CREATE INDEX idx_ai_api_keys_active ON ai_api_keys(is_active) WHERE is_active;

-- ============================================================================
-- AI MODEL CONFIGURATION (which model to use for each activity)
-- ============================================================================
CREATE TABLE ai_model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- activity values: 'design_review', 'dev_qa', 'chatbot_ticket', 'chatbot_board',
--   'chatbot_global', 'client_brain', 'nano_banana_edit', 'nano_banana_generate',
--   'email_draft', 'video_generation', 'brief_assist'

CREATE INDEX idx_ai_model_config_activity ON ai_model_config(activity);

-- ============================================================================
-- AI USAGE LOG (tracks every AI call for cost analysis)
-- ============================================================================
CREATE TABLE ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  activity TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status values: 'success', 'error', 'budget_blocked', 'rate_limited'

CREATE INDEX idx_ai_usage_log_user ON ai_usage_log(user_id);
CREATE INDEX idx_ai_usage_log_activity ON ai_usage_log(activity);
CREATE INDEX idx_ai_usage_log_provider ON ai_usage_log(provider);
CREATE INDEX idx_ai_usage_log_created_at ON ai_usage_log(created_at DESC);
CREATE INDEX idx_ai_usage_log_board ON ai_usage_log(board_id);
CREATE INDEX idx_ai_usage_log_client ON ai_usage_log(client_id);

-- ============================================================================
-- AI BUDGET CONFIGURATION
-- ============================================================================
CREATE TABLE ai_budget_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  scope_id TEXT,
  monthly_cap_usd NUMERIC(10,2) NOT NULL DEFAULT 100.00,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- scope values: 'global', 'provider', 'activity', 'user', 'board', 'client'
-- scope_id: NULL for global, provider name, activity name, user UUID, board UUID, client UUID

CREATE UNIQUE INDEX idx_ai_budget_config_scope ON ai_budget_config(scope, COALESCE(scope_id, ''));
CREATE INDEX idx_ai_budget_config_active ON ai_budget_config(is_active) WHERE is_active;

-- ============================================================================
-- SEED DEFAULT MODEL CONFIGURATION
-- ============================================================================
INSERT INTO ai_model_config (activity, provider, model_id, temperature, max_tokens) VALUES
  ('design_review', 'anthropic', 'claude-sonnet-4-5-20250929', 0.3, 4096),
  ('dev_qa', 'anthropic', 'claude-sonnet-4-5-20250929', 0.2, 4096),
  ('chatbot_ticket', 'anthropic', 'claude-sonnet-4-5-20250929', 0.7, 2048),
  ('chatbot_board', 'anthropic', 'claude-sonnet-4-5-20250929', 0.7, 4096),
  ('chatbot_global', 'anthropic', 'claude-sonnet-4-5-20250929', 0.7, 4096),
  ('client_brain', 'anthropic', 'claude-sonnet-4-5-20250929', 0.5, 4096),
  ('nano_banana_edit', 'google', 'gemini-2.0-flash-exp', 0.7, 1024),
  ('nano_banana_generate', 'google', 'gemini-2.0-flash-exp', 0.8, 1024),
  ('email_draft', 'anthropic', 'claude-sonnet-4-5-20250929', 0.6, 2048),
  ('video_generation', 'openai', 'sora-2', 0.7, 1024),
  ('brief_assist', 'anthropic', 'claude-haiku-4-5-20251001', 0.5, 1024);

-- Seed default global budget
INSERT INTO ai_budget_config (scope, scope_id, monthly_cap_usd, alert_threshold_pct) VALUES
  ('global', NULL, 500.00, 80);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE ai_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_config ENABLE ROW LEVEL SECURITY;

-- API keys: all authenticated users can read (to check availability), only admins should manage
-- (Fine-grained admin check will be done in API routes, RLS allows authenticated access)
CREATE POLICY "ai_api_keys_select" ON ai_api_keys
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_api_keys_insert" ON ai_api_keys
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ai_api_keys_update" ON ai_api_keys
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "ai_api_keys_delete" ON ai_api_keys
  FOR DELETE TO authenticated USING (true);

-- Model config: readable by all, writable by admins (enforced in API)
CREATE POLICY "ai_model_config_select" ON ai_model_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_model_config_insert" ON ai_model_config
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ai_model_config_update" ON ai_model_config
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "ai_model_config_delete" ON ai_model_config
  FOR DELETE TO authenticated USING (true);

-- Usage log: readable by all, insertable by system
CREATE POLICY "ai_usage_log_select" ON ai_usage_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_usage_log_insert" ON ai_usage_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Budget config: readable by all, writable by admins (enforced in API)
CREATE POLICY "ai_budget_config_select" ON ai_budget_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_budget_config_insert" ON ai_budget_config
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ai_budget_config_update" ON ai_budget_config
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "ai_budget_config_delete" ON ai_budget_config
  FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_ai_api_keys_updated_at
  BEFORE UPDATE ON ai_api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_ai_model_config_updated_at
  BEFORE UPDATE ON ai_model_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_ai_budget_config_updated_at
  BEFORE UPDATE ON ai_budget_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
