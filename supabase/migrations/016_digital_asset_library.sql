-- Migration 016: Digital Asset Library (P2.7)
-- Auto-archive deliverables, version history, client asset management

-- ============================================================================
-- ASSETS TABLE
-- ============================================================================
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'video', 'document', 'audio', 'font', 'archive', 'other')),
  mime_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  parent_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  source_card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  source_attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- metadata: { "width": 1920, "height": 1080, "duration": 30, "board_type": "graphic_designer", ... }

CREATE INDEX idx_assets_client ON assets(client_id);
CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_tags ON assets USING GIN(tags);
CREATE INDEX idx_assets_source_card ON assets(source_card_id);
CREATE INDEX idx_assets_parent ON assets(parent_asset_id);
CREATE INDEX idx_assets_created ON assets(created_at DESC);

-- ============================================================================
-- ASSET COLLECTIONS (folders/groups)
-- ============================================================================
CREATE TABLE asset_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  parent_collection_id UUID REFERENCES asset_collections(id) ON DELETE SET NULL,
  cover_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE asset_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES asset_collections(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(collection_id, asset_id)
);

CREATE INDEX idx_asset_collections_client ON asset_collections(client_id);
CREATE INDEX idx_collection_items_collection ON asset_collection_items(collection_id);
CREATE INDEX idx_collection_items_asset ON asset_collection_items(asset_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets_select" ON assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "assets_insert" ON assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "assets_update" ON assets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "assets_delete" ON assets FOR DELETE TO authenticated USING (true);

CREATE POLICY "collections_select" ON asset_collections FOR SELECT TO authenticated USING (true);
CREATE POLICY "collections_insert" ON asset_collections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "collections_update" ON asset_collections FOR UPDATE TO authenticated USING (true);
CREATE POLICY "collections_delete" ON asset_collections FOR DELETE TO authenticated USING (true);

CREATE POLICY "collection_items_select" ON asset_collection_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "collection_items_insert" ON asset_collection_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "collection_items_delete" ON asset_collection_items FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================================
CREATE TRIGGER set_assets_updated_at
  BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_asset_collections_updated_at
  BEFORE UPDATE ON asset_collections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
