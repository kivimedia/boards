-- Preview tokens for shareable client links
CREATE TABLE IF NOT EXISTS pageforge_preview_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES pageforge_builds(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_preview_tokens_token ON pageforge_preview_tokens(token);
CREATE INDEX idx_preview_tokens_build ON pageforge_preview_tokens(build_id);

-- Enable RLS
ALTER TABLE pageforge_preview_tokens ENABLE ROW LEVEL SECURITY;

-- Owner can manage their tokens
CREATE POLICY "Users manage own preview tokens" ON pageforge_preview_tokens
  FOR ALL USING (created_by = auth.uid());
