-- Migration 067: Client Board Portal
-- Dedicated client boards with email/password auth, card mirroring, and client isolation
-- Client users get their own board with mirrored cards, can only see their board + map

-- ============================================================================
-- 1. ADD client_id TO profiles (link auth user to a client record)
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON profiles(client_id) WHERE client_id IS NOT NULL;

-- ============================================================================
-- 2. ADD 'client_board' TO board_type ENUM
-- ============================================================================
ALTER TYPE board_type ADD VALUE IF NOT EXISTS 'client_board';

-- ============================================================================
-- 3. ADD client_id TO boards (one dedicated board per client)
-- ============================================================================
ALTER TABLE boards ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_client_board ON boards(client_id) WHERE client_id IS NOT NULL AND type = 'client_board';

-- ============================================================================
-- 4. Client API keys table (clients store their own AI provider keys)
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini')),
  api_key_encrypted TEXT NOT NULL,
  label TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_client_api_keys_client ON client_api_keys(client_id);

ALTER TABLE client_api_keys ENABLE ROW LEVEL SECURITY;

-- Client users can read/write their own keys; internal users can read all
CREATE POLICY "client_api_keys_select" ON client_api_keys
  FOR SELECT TO authenticated USING (
    (SELECT user_role FROM profiles WHERE id = auth.uid()) != 'client'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "client_api_keys_insert" ON client_api_keys
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT user_role FROM profiles WHERE id = auth.uid()) != 'client'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "client_api_keys_update" ON client_api_keys
  FOR UPDATE TO authenticated USING (
    (SELECT user_role FROM profiles WHERE id = auth.uid()) != 'client'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "client_api_keys_delete" ON client_api_keys
  FOR DELETE TO authenticated USING (
    (SELECT user_role FROM profiles WHERE id = auth.uid()) != 'client'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  );

CREATE TRIGGER set_client_api_keys_updated_at
  BEFORE UPDATE ON client_api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 5. UPDATE handle_new_user() TRIGGER
-- Now supports client_id and user_role from user metadata
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, role, user_role, account_status, client_id)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    COALESCE(new.raw_user_meta_data->>'user_role', 'member'),
    COALESCE((new.raw_user_meta_data->>'user_role')::public.user_role, 'member'::public.user_role),
    CASE
      WHEN new.raw_user_meta_data->>'user_role' = 'client' THEN 'active'::public.account_status_enum
      ELSE 'pending'::public.account_status_enum
    END,
    (new.raw_user_meta_data->>'client_id')::UUID
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 6. SEED board_role_access for client_board type
-- ============================================================================
INSERT INTO board_role_access (board_type, agency_role) VALUES
  ('client_board', 'agency_owner'),
  ('client_board', 'account_manager'),
  ('client_board', 'executive_assistant')
ON CONFLICT DO NOTHING;
