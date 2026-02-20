-- Add owner_id to cards for "card owner / lead" feature
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Index for quick lookup of cards by owner
CREATE INDEX IF NOT EXISTS idx_cards_owner_id
  ON cards(owner_id) WHERE owner_id IS NOT NULL;
