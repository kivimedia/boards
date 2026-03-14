-- ============================================================================
-- Migration 103: Google Ads MCP Integration
-- Tables for Google Ads data caching, security audit logging,
-- and SEO-vs-Ads efficiency reports.
-- ============================================================================

-- 1. Google Ads data cache with TTL
CREATE TABLE IF NOT EXISTS google_ads_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_config_id UUID REFERENCES seo_team_configs(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  sanitization_flags TEXT[] DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_gads_cache_lookup ON google_ads_cache(team_config_id, cache_key);
CREATE INDEX idx_gads_cache_expiry ON google_ads_cache(expires_at);

-- 2. Security audit log for MCP output sanitization
CREATE TABLE IF NOT EXISTS security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name TEXT NOT NULL,
  team_config_id UUID REFERENCES seo_team_configs(id) ON DELETE SET NULL,
  raw_output_preview TEXT,
  flags TEXT[] NOT NULL DEFAULT '{}',
  action_taken TEXT NOT NULL DEFAULT 'sanitized',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_security_audit_created ON security_audit_log(created_at DESC);
CREATE INDEX idx_security_audit_flags ON security_audit_log USING GIN(flags);

-- 3. SEO vs Ads efficiency reports (monthly cron output)
CREATE TABLE IF NOT EXISTS seo_ads_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_config_id UUID REFERENCES seo_team_configs(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL DEFAULT 'monthly_efficiency',
  report_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_seo_ads_reports_team ON seo_ads_reports(team_config_id, created_at DESC);

-- 4. Extend seo_team_configs with Google Ads credential columns
ALTER TABLE seo_team_configs
  ADD COLUMN IF NOT EXISTS scrape_creators_api_key TEXT,
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;

-- 5. RLS policies
ALTER TABLE google_ads_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_ads_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read google_ads_cache"
  ON google_ads_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage google_ads_cache"
  ON google_ads_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read security_audit_log"
  ON security_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert security_audit_log"
  ON security_audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update security_audit_log"
  ON security_audit_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read seo_ads_reports"
  ON seo_ads_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage seo_ads_reports"
  ON seo_ads_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
