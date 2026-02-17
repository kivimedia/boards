-- ============================================================================
-- 038: Brain Multi-Source Indexing
-- Expands source_type constraint to include map_board, wiki, asset, email
-- Creates/replaces match_brain_documents RPC function
-- ============================================================================

-- Expand source_type constraint
ALTER TABLE client_brain_documents
  DROP CONSTRAINT IF EXISTS client_brain_documents_source_type_check;

ALTER TABLE client_brain_documents
  ADD CONSTRAINT client_brain_documents_source_type_check
  CHECK (source_type IN ('card', 'comment', 'brief', 'attachment', 'manual', 'map_board', 'wiki', 'asset', 'email'));

-- Create or replace the match_brain_documents RPC function for vector similarity search
CREATE OR REPLACE FUNCTION match_brain_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  p_client_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  source_type text,
  source_id uuid,
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
    cbd.id,
    cbd.client_id,
    cbd.source_type,
    cbd.source_id,
    cbd.title,
    cbd.content,
    cbd.chunk_index,
    cbd.total_chunks,
    cbd.metadata,
    1 - (cbd.embedding <=> query_embedding) AS similarity
  FROM client_brain_documents cbd
  WHERE cbd.is_active = true
    AND (p_client_id IS NULL OR cbd.client_id = p_client_id)
    AND 1 - (cbd.embedding <=> query_embedding) > match_threshold
  ORDER BY cbd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
