-- Add version column to cards for optimistic locking
ALTER TABLE cards ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Auto-increment version on every update
CREATE OR REPLACE FUNCTION increment_card_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS card_version_trigger ON cards;
CREATE TRIGGER card_version_trigger
  BEFORE UPDATE ON cards
  FOR EACH ROW
  EXECUTE FUNCTION increment_card_version();
