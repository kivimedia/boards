-- Track when sensitive credentials were last rotated
ALTER TABLE pageforge_site_profiles
  ADD COLUMN IF NOT EXISTS credentials_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill existing rows
UPDATE pageforge_site_profiles
  SET credentials_updated_at = created_at
  WHERE credentials_updated_at = now();
