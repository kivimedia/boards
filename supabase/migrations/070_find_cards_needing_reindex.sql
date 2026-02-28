-- ============================================================================
-- 070: Add find_cards_needing_reindex RPC function
-- Efficiently finds cards not yet indexed or updated since last index.
-- Uses LEFT JOIN instead of .in() to avoid PostgREST URL limits.
-- ============================================================================

CREATE OR REPLACE FUNCTION find_cards_needing_reindex(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  updated_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  -- Cards with no index state, or updated since last index, or in error state
  SELECT c.id, c.updated_at
  FROM cards c
  LEFT JOIN knowledge_index_state kis
    ON kis.entity_type = 'card' AND kis.entity_id = c.id
  WHERE
    kis.entity_id IS NULL                              -- never indexed
    OR kis.status = 'error'                            -- previously errored
    OR c.updated_at > kis.last_indexed_at              -- updated since last index
  ORDER BY
    CASE WHEN kis.entity_id IS NULL THEN 0 ELSE 1 END, -- unindexed first
    c.updated_at DESC
  LIMIT p_limit;
END;
$$;
