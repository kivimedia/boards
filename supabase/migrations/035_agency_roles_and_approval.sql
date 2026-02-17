-- Migration 035: Agency Roles & Signup Approval
-- Adds agency-specific roles, account approval status, and board-role access mapping

-- 1. Create agency_role enum
DO $$ BEGIN
  CREATE TYPE agency_role_enum AS ENUM (
    'agency_owner',
    'dev',
    'designer',
    'account_manager',
    'executive_assistant',
    'video_editor'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create account_status enum
DO $$ BEGIN
  CREATE TYPE account_status_enum AS ENUM ('pending', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Add columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS agency_role agency_role_enum DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_status account_status_enum DEFAULT 'pending';

-- 4. Create board_role_access table (maps board types to allowed agency roles)
CREATE TABLE IF NOT EXISTS board_role_access (
  board_type text NOT NULL,
  agency_role agency_role_enum NOT NULL,
  PRIMARY KEY (board_type, agency_role)
);

ALTER TABLE board_role_access ENABLE ROW LEVEL SECURITY;

-- Everyone can read the access map
CREATE POLICY "board_role_access_select" ON board_role_access
  FOR SELECT TO authenticated USING (true);

-- Only agency_owner can modify
CREATE POLICY "board_role_access_modify" ON board_role_access
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.agency_role = 'agency_owner'
    )
  );

-- 5. Seed default board-role access mapping
INSERT INTO board_role_access (board_type, agency_role) VALUES
  -- agency_owner has access to ALL board types
  ('dev', 'agency_owner'),
  ('training', 'agency_owner'),
  ('account_manager', 'agency_owner'),
  ('graphic_designer', 'agency_owner'),
  ('executive_assistant', 'agency_owner'),
  ('video_editor', 'agency_owner'),
  ('client_strategy_map', 'agency_owner'),
  ('copy', 'agency_owner'),
  -- dev
  ('dev', 'dev'),
  -- training: everyone
  ('training', 'dev'),
  ('training', 'designer'),
  ('training', 'account_manager'),
  ('training', 'executive_assistant'),
  ('training', 'video_editor'),
  -- account_manager
  ('account_manager', 'account_manager'),
  ('account_manager', 'executive_assistant'),
  -- graphic_designer
  ('graphic_designer', 'designer'),
  -- executive_assistant
  ('executive_assistant', 'executive_assistant'),
  -- video_editor
  ('video_editor', 'video_editor'),
  -- client_strategy_map
  ('client_strategy_map', 'account_manager'),
  ('client_strategy_map', 'executive_assistant'),
  -- copy
  ('copy', 'designer'),
  ('copy', 'account_manager')
ON CONFLICT DO NOTHING;

-- 6. Set existing users to 'active' (they were already approved implicitly)
UPDATE profiles SET account_status = 'active' WHERE account_status IS NULL OR account_status = 'pending';

-- 7. Update the handle_new_user trigger to set pending status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, role, user_role, account_status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', new.email),
    new.raw_user_meta_data->>'avatar_url',
    'member',
    'member',
    'pending'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
