-- Backfill created_at for Trello-imported comments using the timestamp
-- embedded in MongoDB/Trello ObjectIDs (first 8 hex chars = Unix seconds).
--
-- Trello comment IDs look like: 5e1a2b3c4d5e6f7890abcdef
-- The first 8 hex characters encode the Unix timestamp in seconds.
--
-- This migration reads the migration_entity_map table (which links
-- Trello source IDs to KM Board comment IDs) and updates comments.created_at
-- using the timestamp extracted from the Trello ID.

UPDATE comments c
SET created_at = to_timestamp(
  ('x' || lpad(left(mem.source_id, 8), 8, '0'))::bit(32)::bigint
)
FROM migration_entity_map mem
WHERE mem.source_type = 'comment'
  AND mem.target_id = c.id::text
  AND c.created_at IS NULL
     OR (
       -- Also update comments where all timestamps on the card are identical
       -- (sign of a bulk import that missed the date)
       c.id IN (
         SELECT id FROM comments c2
         WHERE c2.card_id = c.card_id
         GROUP BY c2.card_id
         HAVING count(DISTINCT c2.created_at) <= 1
            AND count(*) > 1
       )
     );
