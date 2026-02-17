-- Migration 022: AI Cost Profiling & Model Management (P3.4)
-- Model pricing, activity config, budget alerts, A/B testing

-- ============================================================================
-- AI MODEL PRICING (per-model cost data)
-- ============================================================================
CREATE TABLE ai_model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_cost_per_1k NUMERIC(10,6) NOT NULL DEFAULT 0,
  output_cost_per_1k NUMERIC(10,6) NOT NULL DEFAULT 0,
  image_cost_per_unit NUMERIC(10,6) NOT NULL DEFAULT 0,
  video_cost_per_second NUMERIC(10,6) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, model_id, effective_from)
);

CREATE INDEX idx_model_pricing_lookup ON ai_model_pricing(provider, model_id, effective_from);

-- ============================================================================
-- AI ACTIVITY CONFIG (per-activity model assignment + A/B testing)
-- ============================================================================
CREATE TABLE ai_activity_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 100, -- for A/B testing (0-100)
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_config_activity ON ai_activity_config(activity);

-- ============================================================================
-- AI BUDGET ALERTS
-- ============================================================================
CREATE TABLE ai_budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'user', 'board', 'activity')),
  scope_id TEXT, -- user_id, board_id, or activity name
  threshold_percent INTEGER NOT NULL CHECK (threshold_percent IN (50, 75, 90, 100)),
  monthly_cap NUMERIC(10,2) NOT NULL,
  current_spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  alerted_at TIMESTAMPTZ,
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  period_start DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_budget_alerts_scope ON ai_budget_alerts(scope, scope_id);
CREATE INDEX idx_budget_alerts_period ON ai_budget_alerts(period_start);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE ai_model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_activity_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "model_pricing_select" ON ai_model_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "model_pricing_insert" ON ai_model_pricing FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "model_pricing_update" ON ai_model_pricing FOR UPDATE TO authenticated USING (true);

CREATE POLICY "activity_config_select" ON ai_activity_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "activity_config_insert" ON ai_activity_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "activity_config_update" ON ai_activity_config FOR UPDATE TO authenticated USING (true);
CREATE POLICY "activity_config_delete" ON ai_activity_config FOR DELETE TO authenticated USING (true);

CREATE POLICY "budget_alerts_select" ON ai_budget_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "budget_alerts_insert" ON ai_budget_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "budget_alerts_update" ON ai_budget_alerts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "budget_alerts_delete" ON ai_budget_alerts FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_activity_config_updated_at
  BEFORE UPDATE ON ai_activity_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_budget_alerts_updated_at
  BEFORE UPDATE ON ai_budget_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
