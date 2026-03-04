-- Add encrypted credential columns alongside existing plaintext ones.
-- After running the data migration script, plaintext columns will be NULLed out.
ALTER TABLE pageforge_site_profiles
  ADD COLUMN IF NOT EXISTS wp_app_password_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS figma_personal_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS wp_ssh_key_path_encrypted TEXT;
