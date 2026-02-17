-- ============================================================================
-- 037: Board UX Enhancements (Trello Alignment)
-- ============================================================================

-- Board backgrounds
ALTER TABLE boards ADD COLUMN IF NOT EXISTS background_color TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS background_image_url TEXT;

-- Board favorites
CREATE TABLE IF NOT EXISTS board_favorites (
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  board_id UUID REFERENCES boards ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, board_id)
);

ALTER TABLE board_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "board_favorites: user manages own"
  ON board_favorites FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_board_favorites_user ON board_favorites(user_id);

-- Card cover colors (solid color bands)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS cover_color TEXT;

-- Card archive support
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_cards_is_archived ON cards (is_archived) WHERE is_archived = true;
