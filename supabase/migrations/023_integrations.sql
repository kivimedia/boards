-- Migration 023: Integrations - Slack, GitHub, Figma (P3.5)

-- ============================================================================
-- INTEGRATION CONNECTIONS
-- ============================================================================
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('slack', 'github', 'figma')),
  name TEXT NOT NULL,
  access_token_encrypted BYTEA,
  refresh_token_encrypted BYTEA,
  token_expiry TIMESTAMPTZ,
  workspace_id TEXT, -- Slack workspace, GitHub org, Figma team
  metadata JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integrations_provider ON integrations(provider);

-- ============================================================================
-- SLACK BOARD MAPPINGS
-- ============================================================================
CREATE TABLE slack_board_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  notify_card_created BOOLEAN NOT NULL DEFAULT true,
  notify_card_moved BOOLEAN NOT NULL DEFAULT true,
  notify_card_completed BOOLEAN NOT NULL DEFAULT true,
  notify_comments BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, channel_id)
);

CREATE INDEX idx_slack_mappings_board ON slack_board_mappings(board_id);

-- ============================================================================
-- GITHUB CARD LINKS
-- ============================================================================
CREATE TABLE github_card_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('issue', 'pull_request', 'branch')),
  github_id INTEGER, -- GitHub issue/PR number
  github_url TEXT NOT NULL,
  state TEXT, -- open, closed, merged
  title TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_github_links_card ON github_card_links(card_id);
CREATE INDEX idx_github_links_repo ON github_card_links(repo_owner, repo_name);

-- ============================================================================
-- FIGMA CARD EMBEDS
-- ============================================================================
CREATE TABLE figma_card_embeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  figma_file_key TEXT NOT NULL,
  figma_node_id TEXT,
  figma_url TEXT NOT NULL,
  embed_type TEXT NOT NULL CHECK (embed_type IN ('file', 'frame', 'component', 'prototype')),
  title TEXT,
  thumbnail_url TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_figma_embeds_card ON figma_card_embeds(card_id);

-- ============================================================================
-- WEBHOOK EVENTS (incoming from integrations)
-- ============================================================================
CREATE TABLE integration_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_provider ON integration_webhook_events(provider, event_type);
CREATE INDEX idx_webhook_events_unprocessed ON integration_webhook_events(processed) WHERE processed = false;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE slack_board_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_card_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE figma_card_embeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_select" ON integrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "integrations_insert" ON integrations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "integrations_update" ON integrations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "integrations_delete" ON integrations FOR DELETE TO authenticated USING (true);

CREATE POLICY "slack_mappings_select" ON slack_board_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "slack_mappings_insert" ON slack_board_mappings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "slack_mappings_update" ON slack_board_mappings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "slack_mappings_delete" ON slack_board_mappings FOR DELETE TO authenticated USING (true);

CREATE POLICY "github_links_select" ON github_card_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "github_links_insert" ON github_card_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "github_links_update" ON github_card_links FOR UPDATE TO authenticated USING (true);
CREATE POLICY "github_links_delete" ON github_card_links FOR DELETE TO authenticated USING (true);

CREATE POLICY "figma_embeds_select" ON figma_card_embeds FOR SELECT TO authenticated USING (true);
CREATE POLICY "figma_embeds_insert" ON figma_card_embeds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "figma_embeds_update" ON figma_card_embeds FOR UPDATE TO authenticated USING (true);
CREATE POLICY "figma_embeds_delete" ON figma_card_embeds FOR DELETE TO authenticated USING (true);

CREATE POLICY "webhook_events_select" ON integration_webhook_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "webhook_events_insert" ON integration_webhook_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "webhook_events_update" ON integration_webhook_events FOR UPDATE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_integrations_updated_at
  BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_github_links_updated_at
  BEFORE UPDATE ON github_card_links FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_figma_embeds_updated_at
  BEFORE UPDATE ON figma_card_embeds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
