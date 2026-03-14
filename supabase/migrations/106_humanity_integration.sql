-- 106: Humanity API integration for shift matching
-- Adds humanity_config to both historian and SEO config tables
-- Used by the shared humanity-matcher agent

ALTER TABLE historian_configs ADD COLUMN IF NOT EXISTS humanity_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE seo_team_configs ADD COLUMN IF NOT EXISTS humanity_config JSONB DEFAULT '{}'::jsonb;

-- Index for faster match_status filtering on historian_images
CREATE INDEX IF NOT EXISTS idx_historian_images_match ON historian_images(match_status);

-- humanity_config schema:
-- {
--   "access_token_encrypted": "hex_encrypted_string",
--   "app_id": "string",
--   "app_secret_encrypted": "hex_encrypted_string",
--   "enabled": boolean
-- }
