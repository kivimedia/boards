-- AI Ops Dashboard vendor tracking

CREATE TABLE IF NOT EXISTS ai_vendor_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_key TEXT,
  provider_name TEXT NOT NULL,
  product_type TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('ai_subscription', 'ai_api', 'hosting', 'database', 'developer_tool', 'monitoring', 'other')),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy', 'nearing_limit', 'exhausted', 'renewed_recently', 'unknown', 'manual_update_needed')),
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('api_synced', 'manual', 'estimated', 'email_derived', 'browser_assisted')),
  confidence_level TEXT NOT NULL DEFAULT 'low' CHECK (confidence_level IN ('high', 'medium', 'low')),
  plan_name TEXT,
  account_label TEXT,
  billing_period_start TIMESTAMPTZ,
  billing_period_end TIMESTAMPTZ,
  spend_current_period NUMERIC(12, 2),
  budget_limit NUMERIC(12, 2),
  remaining_budget NUMERIC(12, 2),
  remaining_credits NUMERIC(12, 2),
  estimated_remaining_capacity NUMERIC(6, 4),
  renewal_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  stale_after TIMESTAMPTZ,
  no_overage_allowed BOOLEAN NOT NULL DEFAULT false,
  provider_url TEXT,
  notes TEXT,
  sync_error TEXT,
  is_manual BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_vendor_spend_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_account_id UUID NOT NULL REFERENCES ai_vendor_accounts(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('api_synced', 'manual', 'estimated', 'email_derived', 'browser_assisted')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_vendor_accounts_owner ON ai_vendor_accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_vendor_accounts_status ON ai_vendor_accounts(status);
CREATE INDEX IF NOT EXISTS idx_ai_vendor_accounts_category ON ai_vendor_accounts(category);
CREATE INDEX IF NOT EXISTS idx_ai_vendor_spend_snapshots_account_recorded ON ai_vendor_spend_snapshots(vendor_account_id, recorded_at DESC);

ALTER TABLE ai_vendor_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_vendor_spend_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_vendor_accounts_select_own"
ON ai_vendor_accounts FOR SELECT TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY "ai_vendor_accounts_insert_own"
ON ai_vendor_accounts FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "ai_vendor_accounts_update_own"
ON ai_vendor_accounts FOR UPDATE TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY "ai_vendor_accounts_delete_own"
ON ai_vendor_accounts FOR DELETE TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY "ai_vendor_spend_snapshots_select_own"
ON ai_vendor_spend_snapshots FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM ai_vendor_accounts
    WHERE ai_vendor_accounts.id = ai_vendor_spend_snapshots.vendor_account_id
      AND ai_vendor_accounts.owner_user_id = auth.uid()
  )
);

CREATE POLICY "ai_vendor_spend_snapshots_insert_own"
ON ai_vendor_spend_snapshots FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM ai_vendor_accounts
    WHERE ai_vendor_accounts.id = ai_vendor_spend_snapshots.vendor_account_id
      AND ai_vendor_accounts.owner_user_id = auth.uid()
  )
);

CREATE POLICY "ai_vendor_spend_snapshots_update_own"
ON ai_vendor_spend_snapshots FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM ai_vendor_accounts
    WHERE ai_vendor_accounts.id = ai_vendor_spend_snapshots.vendor_account_id
      AND ai_vendor_accounts.owner_user_id = auth.uid()
  )
);

CREATE POLICY "ai_vendor_spend_snapshots_delete_own"
ON ai_vendor_spend_snapshots FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM ai_vendor_accounts
    WHERE ai_vendor_accounts.id = ai_vendor_spend_snapshots.vendor_account_id
      AND ai_vendor_accounts.owner_user_id = auth.uid()
  )
);

CREATE TRIGGER set_ai_vendor_accounts_updated_at
  BEFORE UPDATE ON ai_vendor_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
