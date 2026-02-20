-- Migration 056: Feature Permission Delegation
-- Allows admins to delegate access to admin-only features to specific roles or users

CREATE TABLE IF NOT EXISTS feature_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT NOT NULL,
  granted_role TEXT,
  granted_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Exactly one of granted_role or granted_user_id must be set
  CONSTRAINT feature_permissions_one_grant CHECK (
    (granted_role IS NOT NULL AND granted_user_id IS NULL)
    OR (granted_role IS NULL AND granted_user_id IS NOT NULL)
  ),

  -- Unique per role grant
  CONSTRAINT feature_permissions_unique_role UNIQUE (feature_key, granted_role),
  -- Unique per user grant
  CONSTRAINT feature_permissions_unique_user UNIQUE (feature_key, granted_user_id)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_feature_permissions_user ON feature_permissions(granted_user_id) WHERE granted_user_id IS NOT NULL;
-- Index for fast lookups by role
CREATE INDEX IF NOT EXISTS idx_feature_permissions_role ON feature_permissions(granted_role) WHERE granted_role IS NOT NULL;
-- Index for fast lookups by feature key
CREATE INDEX IF NOT EXISTS idx_feature_permissions_feature ON feature_permissions(feature_key);

-- RLS
ALTER TABLE feature_permissions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed for access checks)
CREATE POLICY "feature_permissions_select" ON feature_permissions
  FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "feature_permissions_insert" ON feature_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.user_role = 'admin' OR profiles.agency_role = 'agency_owner')
    )
  );

-- Only admins can delete
CREATE POLICY "feature_permissions_delete" ON feature_permissions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.user_role = 'admin' OR profiles.agency_role = 'agency_owner')
    )
  );
