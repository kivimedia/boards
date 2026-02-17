-- Migration 047: Saved Commands (Board Command Mode Recipes)
-- Stores user-saved NL commands for quick replay

CREATE TABLE saved_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  icon TEXT DEFAULT 'zap',
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_saved_commands_board ON saved_commands(board_id);

ALTER TABLE saved_commands ENABLE ROW LEVEL SECURITY;

-- Board members can read saved commands for their boards
CREATE POLICY "Board members can read saved commands"
  ON saved_commands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = saved_commands.board_id
      AND board_members.user_id = auth.uid()
    )
  );

-- Editors and above can create saved commands
CREATE POLICY "Editors can create saved commands"
  ON saved_commands FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = saved_commands.board_id
      AND board_members.user_id = auth.uid()
      AND board_members.role IN ('admin', 'department_lead', 'member')
    )
  );

-- Creator or admin can delete saved commands
CREATE POLICY "Creator or admin can delete saved commands"
  ON saved_commands FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = saved_commands.board_id
      AND board_members.user_id = auth.uid()
      AND board_members.role = 'admin'
    )
  );

-- Creator can update saved commands (usage_count bump)
CREATE POLICY "Creator can update saved commands"
  ON saved_commands FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_members.board_id = saved_commands.board_id
      AND board_members.user_id = auth.uid()
    )
  );
