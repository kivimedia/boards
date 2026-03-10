-- Efficient RPC to find cards that haven't moved columns recently.
-- Used by the executive dashboard to surface stuck/stale cards.

CREATE OR REPLACE FUNCTION get_stuck_cards(
  p_days_threshold INT DEFAULT 5,
  p_max_results INT DEFAULT 15
)
RETURNS TABLE (
  card_id UUID,
  title TEXT,
  board_id UUID,
  board_name TEXT,
  list_name TEXT,
  priority TEXT,
  due_date TIMESTAMPTZ,
  owner_id UUID,
  owner_name TEXT,
  owner_avatar TEXT,
  days_stuck INT,
  last_moved_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_moves AS (
    SELECT DISTINCT ON (cch.card_id)
      cch.card_id,
      cch.moved_at
    FROM card_column_history cch
    ORDER BY cch.card_id, cch.moved_at DESC
  ),
  active_cards AS (
    SELECT
      cp.card_id,
      cp.list_id,
      c.title,
      c.priority,
      c.due_date,
      c.owner_id,
      c.created_at AS card_created_at
    FROM card_placements cp
    JOIN cards c ON c.id = cp.card_id
    WHERE cp.is_mirror = false
  )
  SELECT
    ac.card_id,
    ac.title,
    b.id AS board_id,
    b.name AS board_name,
    l.name AS list_name,
    ac.priority,
    ac.due_date,
    ac.owner_id,
    p.display_name AS owner_name,
    p.avatar_url AS owner_avatar,
    EXTRACT(DAY FROM NOW() - COALESCE(lm.moved_at, ac.card_created_at))::INT AS days_stuck,
    COALESCE(lm.moved_at, ac.card_created_at) AS last_moved_at
  FROM active_cards ac
  JOIN lists l ON l.id = ac.list_id
  JOIN boards b ON b.id = l.board_id
  LEFT JOIN latest_moves lm ON lm.card_id = ac.card_id
  LEFT JOIN profiles p ON p.id = ac.owner_id
  WHERE b.is_archived = false
    AND EXTRACT(DAY FROM NOW() - COALESCE(lm.moved_at, ac.card_created_at)) >= p_days_threshold
    AND LOWER(l.name) NOT IN (
      'done', 'completed', 'delivered', 'deployed',
      'published', 'closed', 'approved', 'archived',
      'backlog'
    )
  ORDER BY days_stuck DESC
  LIMIT p_max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
