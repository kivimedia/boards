-- Prevent duplicate card placements (same card in same list)
-- Migration created after cleaning up 1686 duplicates from Feb 22 Trello migration
ALTER TABLE card_placements
  ADD CONSTRAINT card_placements_card_list_unique UNIQUE (card_id, list_id);
