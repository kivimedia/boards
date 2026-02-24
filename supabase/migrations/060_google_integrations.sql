-- Migration 060: Google Workspace integrations
-- Stores encrypted OAuth tokens for Gmail API and Calendar API access

CREATE TABLE IF NOT EXISTS google_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expiry TIMESTAMPTZ,
  scopes JSONB DEFAULT '[]', -- ["gmail.readonly", "gmail.send", "gmail.compose", "calendar.readonly"]
  connected_email TEXT, -- e.g. halley@carolinaballoons.com
  selected_calendars JSONB DEFAULT '[]', -- calendar IDs selected for capacity awareness
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Only one Google integration per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_integrations_user ON google_integrations(user_id);

-- Owner-only RLS (users can only see/manage their own tokens)
ALTER TABLE google_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "google_integrations_owner" ON google_integrations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER set_google_integrations_updated_at
  BEFORE UPDATE ON google_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
