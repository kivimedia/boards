-- Historian team configuration table
-- Stores per-client historian settings including Slack credentials
-- Uses the same encrypted token pattern as seo_team_configs

CREATE TABLE IF NOT EXISTS historian_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  source_name TEXT NOT NULL DEFAULT 'slack',
  source_channel TEXT,
  slack_credentials JSONB DEFAULT '{}'::jsonb,
  lookback_months INTEGER NOT NULL DEFAULT 12,
  archive_storage_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Historian archive: stores analyzed images
CREATE TABLE IF NOT EXISTS historian_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES historian_configs(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL,
  source_channel TEXT,
  source_message_ref TEXT,
  slack_upload_ts TEXT,
  post_date TIMESTAMPTZ,
  uploader TEXT,
  original_filename TEXT,
  file_type TEXT,
  dimensions TEXT,
  title TEXT,
  short_description TEXT,
  archival_note TEXT,
  tags TEXT[] DEFAULT '{}',
  category TEXT,
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),
  quality_notes TEXT,
  scoring_dimensions JSONB DEFAULT '{}'::jsonb,
  keep_decision TEXT CHECK (keep_decision IN ('approved', 'rejected', 'review')),
  decision_rationale TEXT,
  original_asset_path TEXT,
  clean_asset_path TEXT,
  sidekick_assessment JSONB,
  client_name TEXT,
  event_date DATE,
  humanity_ref TEXT,
  product_type TEXT,
  match_status TEXT,
  match_rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_historian_images_config ON historian_images(config_id);
CREATE INDEX idx_historian_images_category ON historian_images(category);
CREATE INDEX idx_historian_images_score ON historian_images(quality_score);
CREATE INDEX idx_historian_images_decision ON historian_images(keep_decision);
CREATE UNIQUE INDEX idx_historian_images_unique ON historian_images(config_id, image_id);

-- Enable RLS
ALTER TABLE historian_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE historian_images ENABLE ROW LEVEL SECURITY;

-- RLS policies (service role bypass, authenticated users can read)
CREATE POLICY historian_configs_read ON historian_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY historian_configs_write ON historian_configs FOR ALL TO authenticated USING (true);
CREATE POLICY historian_images_read ON historian_images FOR SELECT TO authenticated USING (true);
CREATE POLICY historian_images_write ON historian_images FOR ALL TO authenticated USING (true);
