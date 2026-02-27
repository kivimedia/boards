-- ============================================================================
-- 069: Knowledge Embeddings - Background AI Knowledge System
-- Workspace-wide vector store for semantic search across all cards/boards.
-- Separate from client_brain_documents (which requires client_id NOT NULL).
-- ============================================================================

-- ============================================================================
-- KNOWLEDGE EMBEDDINGS - per-card and per-board vector store
-- ============================================================================
CREATE TABLE knowledge_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('card', 'board_summary')),
  source_id UUID NOT NULL,
  board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_index INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_updated_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ke_source ON knowledge_embeddings(source_type, source_id);
CREATE INDEX idx_ke_board ON knowledge_embeddings(board_id) WHERE is_active = true;
CREATE INDEX idx_ke_active ON knowledge_embeddings(is_active) WHERE is_active = true;
CREATE INDEX idx_ke_hash ON knowledge_embeddings(source_type, source_id, content_hash);

-- Vector similarity index
CREATE INDEX idx_ke_embedding ON knowledge_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE TRIGGER set_ke_updated_at
  BEFORE UPDATE ON knowledge_embeddings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- BOARD SUMMARIES - pre-computed Haiku-generated board overviews
-- ============================================================================
CREATE TABLE board_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE UNIQUE,
  summary_text TEXT NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}',
  key_themes TEXT[] NOT NULL DEFAULT '{}',
  generated_by TEXT NOT NULL DEFAULT 'haiku',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_bs_updated_at
  BEFORE UPDATE ON board_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- KNOWLEDGE INDEX STATE - tracks what has been indexed (incremental)
-- ============================================================================
CREATE TABLE knowledge_index_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('card', 'board')),
  entity_id UUID NOT NULL,
  last_indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'indexed' CHECK (status IN ('indexed', 'pending', 'error')),
  error_message TEXT,
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX idx_kis_pending ON knowledge_index_state(status) WHERE status = 'pending';
CREATE INDEX idx_kis_entity ON knowledge_index_state(entity_type, entity_id);

-- ============================================================================
-- RPC: match_knowledge_embeddings - vector similarity search
-- ============================================================================
CREATE OR REPLACE FUNCTION match_knowledge_embeddings(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.65,
  match_count int DEFAULT 10,
  p_board_id uuid DEFAULT NULL,
  p_source_types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_type text,
  source_id uuid,
  board_id uuid,
  title text,
  content text,
  chunk_index int,
  total_chunks int,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ke.id,
    ke.source_type,
    ke.source_id,
    ke.board_id,
    ke.title,
    ke.content,
    ke.chunk_index,
    ke.total_chunks,
    ke.metadata,
    1 - (ke.embedding <=> query_embedding) AS similarity
  FROM knowledge_embeddings ke
  WHERE ke.is_active = true
    AND (p_board_id IS NULL OR ke.board_id = p_board_id)
    AND (p_source_types IS NULL OR ke.source_type = ANY(p_source_types))
    AND 1 - (ke.embedding <=> query_embedding) > match_threshold
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE knowledge_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_index_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ke_select" ON knowledge_embeddings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ke_insert" ON knowledge_embeddings
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ke_update" ON knowledge_embeddings
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ke_delete" ON knowledge_embeddings
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "bs_select" ON board_summaries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "bs_insert" ON board_summaries
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "bs_update" ON board_summaries
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "bs_delete" ON board_summaries
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "kis_select" ON knowledge_index_state
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "kis_insert" ON knowledge_index_state
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kis_update" ON knowledge_index_state
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kis_delete" ON knowledge_index_state
  FOR DELETE TO authenticated USING (true);
