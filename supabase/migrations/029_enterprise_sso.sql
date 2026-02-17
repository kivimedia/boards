-- Migration 029: Enterprise SSO, IP Whitelist, Advanced Audit (P5.1-5.2)

-- SSO Configuration
CREATE TABLE IF NOT EXISTS sso_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('saml', 'oidc')),
  name TEXT NOT NULL,
  issuer_url TEXT,
  metadata_url TEXT,
  client_id TEXT,
  client_secret_encrypted TEXT,
  certificate TEXT,
  attribute_mapping JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_provision_users BOOLEAN NOT NULL DEFAULT false,
  default_role TEXT NOT NULL DEFAULT 'member',
  allowed_domains TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- IP Whitelist rules
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cidr TEXT NOT NULL, -- IP or CIDR range (e.g., 192.168.1.0/24)
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Advanced audit log (all actions with old/new values)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL, -- e.g. card.update, board.delete, user.login
  resource_type TEXT NOT NULL, -- e.g. card, board, user
  resource_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Review confidence scoring additions
ALTER TABLE ai_review_results ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,4);
ALTER TABLE ai_review_results ADD COLUMN IF NOT EXISTS accuracy_verified BOOLEAN;
ALTER TABLE ai_review_results ADD COLUMN IF NOT EXISTS accuracy_verified_by UUID REFERENCES auth.users(id);
ALTER TABLE ai_review_results ADD COLUMN IF NOT EXISTS accuracy_verified_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sso_configs_active ON sso_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_ip_whitelist_active ON ip_whitelist(is_active);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, created_at);

-- RLS
ALTER TABLE sso_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- SSO and IP whitelist: admin-only via application layer (service role)
CREATE POLICY "Admins manage SSO configs" ON sso_configs FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_role = 'admin')
);
CREATE POLICY "Admins manage IP whitelist" ON ip_whitelist FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_role = 'admin')
);
CREATE POLICY "Users view own audit log" ON audit_log FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_role = 'admin')
);
