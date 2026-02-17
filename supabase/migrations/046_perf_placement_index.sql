-- Performance: Add index for the board loading query
-- The main query is: SELECT * FROM card_placements WHERE list_id IN (...) ORDER BY position
-- Existing idx_card_placements_board_list starts with board_id, which doesn't help this query pattern.
-- This index covers the list_id filter + position sort directly.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_card_placements_list_position
  ON card_placements(list_id, position);

-- Also add index for cards table lookups during the join
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_id_kanban
  ON cards(id) INCLUDE (title, description, priority, due_date, cover_image_url, created_at, updated_at);
