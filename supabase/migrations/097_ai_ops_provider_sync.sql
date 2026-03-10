-- AI Ops Dashboard provider sync connections and token tracking

CREATE TABLE IF NOT EXISTS ai_vendor_sync_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL CHECK (provider_key IN ('openai', 'anthropic')),
  connection_type TEXT NOT NULL CHECK (connection_type IN ('openai_admin_key', 'anthropic_admin_key')),
  label TEXT NOT NULL,
  secret_encrypted TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_tested_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (last_sync_status IN ('pending', 'ok', 'warning', 'error')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_vendor_sync_connections_owner
  ON ai_vendor_sync_connections(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_ai_vendor_sync_connections_provider
  ON ai_vendor_sync_connections(provider_key);

ALTER TABLE ai_vendor_sync_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_vendor_sync_connections_select_own"
ON ai_vendor_sync_connections FOR SELECT TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY "ai_vendor_sync_connections_insert_own"
ON ai_vendor_sync_connections FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "ai_vendor_sync_connections_update_own"
ON ai_vendor_sync_connections FOR UPDATE TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY "ai_vendor_sync_connections_delete_own"
ON ai_vendor_sync_connections FOR DELETE TO authenticated
USING (owner_user_id = auth.uid());

CREATE TRIGGER set_ai_vendor_sync_connections_updated_at
  BEFORE UPDATE ON ai_vendor_sync_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE ai_vendor_accounts
  ADD COLUMN IF NOT EXISTS sync_connection_id UUID REFERENCES ai_vendor_sync_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_account_ref TEXT,
  ADD COLUMN IF NOT EXISTS tracked_requests_current_period INTEGER,
  ADD COLUMN IF NOT EXISTS tracked_input_tokens_current_period BIGINT,
  ADD COLUMN IF NOT EXISTS tracked_output_tokens_current_period BIGINT,
  ADD COLUMN IF NOT EXISTS tracked_total_tokens_current_period BIGINT;

CREATE INDEX IF NOT EXISTS idx_ai_vendor_accounts_sync_connection
  ON ai_vendor_accounts(sync_connection_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_vendor_accounts_sync_ref
  ON ai_vendor_accounts(sync_connection_id, external_account_ref)
  WHERE sync_connection_id IS NOT NULL AND external_account_ref IS NOT NULL;
