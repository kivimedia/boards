-- Migration 041: Board Archiving & Starring
-- Adds is_archived and is_starred columns to boards table

ALTER TABLE boards ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false NOT NULL;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_boards_archived ON boards (is_archived);
CREATE INDEX IF NOT EXISTS idx_boards_starred ON boards (is_starred) WHERE is_starred = true;
