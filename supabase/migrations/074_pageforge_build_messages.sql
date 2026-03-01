-- ============================================================================
-- 074: PageForge Build Messages
-- Chat between users and the orchestrator during builds
-- ============================================================================

CREATE TABLE pageforge_build_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES pageforge_builds(id) ON DELETE CASCADE,

  -- Who sent it
  role TEXT NOT NULL CHECK (role IN ('user', 'orchestrator', 'system')),
  sender_name TEXT,           -- display name (user name or agent name)
  sender_id UUID,             -- auth.users id for user messages

  -- Content
  content TEXT NOT NULL,
  phase TEXT,                 -- which phase was active when sent
  phase_index INTEGER,

  -- Metadata
  metadata JSONB DEFAULT '{}',  -- extra context (e.g. cost, tokens, artifacts)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pf_messages_build ON pageforge_build_messages(build_id, created_at ASC);

-- RLS
ALTER TABLE pageforge_build_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage build messages"
  ON pageforge_build_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service role (VPS worker) full access
CREATE POLICY "Service role full access to build messages"
  ON pageforge_build_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
