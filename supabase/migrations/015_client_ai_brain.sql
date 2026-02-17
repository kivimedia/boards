-- Migration 015: Client AI Brain (P2.5)
-- pgvector RAG pipeline for client-specific knowledge

-- ============================================================================
-- ENABLE PGVECTOR EXTENSION
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- CLIENT BRAIN DOCUMENTS
-- ============================================================================
CREATE TABLE client_brain_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('card', 'comment', 'brief', 'attachment', 'manual')),
  source_id UUID,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_index INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- metadata: { "card_id": "...", "board_type": "...", "deliverable_type": "...", "tags": [...] }

CREATE INDEX idx_brain_docs_client ON client_brain_documents(client_id);
CREATE INDEX idx_brain_docs_source ON client_brain_documents(source_type, source_id);
CREATE INDEX idx_brain_docs_active ON client_brain_documents(client_id, is_active);

-- Vector similarity index (IVFFlat for performance on moderate dataset sizes)
CREATE INDEX idx_brain_docs_embedding ON client_brain_documents
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- CLIENT BRAIN QUERY LOG
-- ============================================================================
CREATE TABLE client_brain_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  sources JSONB NOT NULL DEFAULT '[]',
  model_used TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_brain_queries_client ON client_brain_queries(client_id);
CREATE INDEX idx_brain_queries_user ON client_brain_queries(user_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE client_brain_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_brain_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brain_docs_select" ON client_brain_documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "brain_docs_insert" ON client_brain_documents
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "brain_docs_update" ON client_brain_documents
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "brain_docs_delete" ON client_brain_documents
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "brain_queries_select" ON client_brain_queries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "brain_queries_insert" ON client_brain_queries
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_brain_docs_updated_at
  BEFORE UPDATE ON client_brain_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
