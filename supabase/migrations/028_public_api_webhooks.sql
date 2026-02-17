-- Migration 028: Public API & Webhooks (P5.0)

-- API Keys for external consumers
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL, -- first 8 chars for identification
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '[]', -- array of allowed scopes
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  rate_limit_per_day INTEGER NOT NULL DEFAULT 10000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage tracking for rate limiting
CREATE TABLE IF NOT EXISTS api_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook subscriptions
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL, -- for HMAC-SHA256 signature
  events TEXT[] NOT NULL DEFAULT '{}', -- e.g. card.created, card.moved, comment.added
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook delivery attempts
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  delivered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_usage_key ON api_usage_log(api_key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, delivered_at);

-- RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own API keys" ON api_keys FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own API usage" ON api_usage_log FOR SELECT USING (
  api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid())
);
CREATE POLICY "Users manage own webhooks" ON webhooks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own webhook deliveries" ON webhook_deliveries FOR SELECT USING (
  webhook_id IN (SELECT id FROM webhooks WHERE user_id = auth.uid())
);
