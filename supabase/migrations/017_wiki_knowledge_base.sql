-- Migration 017: Wiki / Knowledge Base (P2.8)
-- Rich text wiki pages with versioning, department filtering, board pinning

-- ============================================================================
-- WIKI PAGES
-- ============================================================================
CREATE TABLE wiki_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  department TEXT CHECK (department IN ('dev', 'training', 'account_manager', 'graphic_designer', 'executive_assistant', 'video_editor', 'copy', 'general')),
  is_published BOOLEAN NOT NULL DEFAULT false,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_cadence_days INTEGER,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  parent_page_id UUID REFERENCES wiki_pages(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wiki_pages_slug ON wiki_pages(slug);
CREATE INDEX idx_wiki_pages_department ON wiki_pages(department);
CREATE INDEX idx_wiki_pages_published ON wiki_pages(is_published);
CREATE INDEX idx_wiki_pages_owner ON wiki_pages(owner_id);
CREATE INDEX idx_wiki_pages_tags ON wiki_pages USING GIN(tags);
CREATE INDEX idx_wiki_pages_parent ON wiki_pages(parent_page_id);

-- ============================================================================
-- WIKI PAGE VERSIONS
-- ============================================================================
CREATE TABLE wiki_page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  change_summary TEXT,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(page_id, version_number)
);

CREATE INDEX idx_wiki_versions_page ON wiki_page_versions(page_id);

-- ============================================================================
-- BOARD WIKI PINS
-- ============================================================================
CREATE TABLE board_wiki_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  pinned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(board_id, page_id)
);

CREATE INDEX idx_wiki_pins_board ON board_wiki_pins(board_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE wiki_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiki_page_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_wiki_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wiki_pages_select" ON wiki_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "wiki_pages_insert" ON wiki_pages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "wiki_pages_update" ON wiki_pages FOR UPDATE TO authenticated USING (true);
CREATE POLICY "wiki_pages_delete" ON wiki_pages FOR DELETE TO authenticated USING (true);

CREATE POLICY "wiki_versions_select" ON wiki_page_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "wiki_versions_insert" ON wiki_page_versions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "wiki_pins_select" ON board_wiki_pins FOR SELECT TO authenticated USING (true);
CREATE POLICY "wiki_pins_insert" ON board_wiki_pins FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "wiki_pins_delete" ON board_wiki_pins FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_wiki_pages_updated_at
  BEFORE UPDATE ON wiki_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
