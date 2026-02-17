-- Migration 040: Trello Alignment
-- Adds cover image, start date, card size to cards table
-- Adds parent_comment_id for comment threading

-- ============================================================================
-- 1. Cards: cover_image_url, start_date, size
-- ============================================================================

ALTER TABLE cards ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS start_date timestamptz;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS size text CHECK (size IN ('small', 'medium', 'large')) DEFAULT 'medium';

-- Index for date range queries (Gantt, calendar views)
CREATE INDEX IF NOT EXISTS idx_cards_start_date ON cards (start_date) WHERE start_date IS NOT NULL;

-- ============================================================================
-- 2. Comments: parent_comment_id for threading
-- ============================================================================

ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE;

-- Index for fetching replies
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- ============================================================================
-- 3. RLS: cover_image_url and start_date follow same policies as cards
-- No additional policies needed since they're columns on the cards table.
-- ============================================================================
