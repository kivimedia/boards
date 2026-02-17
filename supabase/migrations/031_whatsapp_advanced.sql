-- Migration 031: WhatsApp Advanced + Productivity Polish (P5.4)

-- Custom quick action templates (user-defined commands)
CREATE TABLE IF NOT EXISTS whatsapp_custom_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  label TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}',
  response_template TEXT, -- message template sent back after action
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, keyword)
);

-- Digest templates (custom content blocks)
CREATE TABLE IF NOT EXISTS whatsapp_digest_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]', -- ordered array of section configs
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Productivity PDF report configs
CREATE TABLE IF NOT EXISTS productivity_report_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('individual', 'team', 'department', 'executive')),
  schedule TEXT, -- cron-like or 'daily'/'weekly:monday'/'monthly:1'
  recipients TEXT[] NOT NULL DEFAULT '{}',
  include_sections JSONB NOT NULL DEFAULT '[]',
  filters JSONB NOT NULL DEFAULT '{}',
  format TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'csv', 'xlsx')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generated report files
CREATE TABLE IF NOT EXISTS productivity_report_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID REFERENCES productivity_report_configs(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  format TEXT NOT NULL,
  storage_path TEXT,
  file_size_bytes INTEGER,
  date_range_start TEXT NOT NULL,
  date_range_end TEXT NOT NULL,
  generated_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wa_custom_actions_user ON whatsapp_custom_actions(user_id, keyword);
CREATE INDEX IF NOT EXISTS idx_wa_digest_templates_user ON whatsapp_digest_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_prod_report_configs_creator ON productivity_report_configs(created_by);
CREATE INDEX IF NOT EXISTS idx_prod_report_files_config ON productivity_report_files(config_id, created_at);

-- RLS
ALTER TABLE whatsapp_custom_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_digest_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE productivity_report_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE productivity_report_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own custom actions" ON whatsapp_custom_actions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own digest templates" ON whatsapp_digest_templates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own report configs" ON productivity_report_configs FOR ALL USING (auth.uid() = created_by);
CREATE POLICY "Users view own report files" ON productivity_report_files FOR ALL USING (auth.uid() = generated_by);
