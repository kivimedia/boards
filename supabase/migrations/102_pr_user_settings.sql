-- PR User Settings: Per-user pipeline configuration for Team PR
CREATE TABLE IF NOT EXISTS pr_user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE pr_user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own PR settings"
  ON pr_user_settings FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER update_pr_user_settings_updated_at
  BEFORE UPDATE ON pr_user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
