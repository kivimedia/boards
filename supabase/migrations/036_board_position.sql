-- Add position column to boards for custom ordering
ALTER TABLE boards ADD COLUMN position INTEGER;

-- Backfill: assign positions based on current created_at order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS pos
  FROM boards
)
UPDATE boards SET position = numbered.pos FROM numbered WHERE boards.id = numbered.id;

-- Now make it NOT NULL with a default
ALTER TABLE boards ALTER COLUMN position SET NOT NULL;
ALTER TABLE boards ALTER COLUMN position SET DEFAULT 0;

-- Index for ordering
CREATE INDEX idx_boards_position ON boards (position);
