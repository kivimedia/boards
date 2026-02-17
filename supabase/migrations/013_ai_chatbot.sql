-- Migration 013: AI Chatbot (P2.3)
-- Chat sessions with 3 scope levels: ticket, board, all-boards

-- ============================================================================
-- CHAT SESSIONS
-- ============================================================================
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('ticket', 'board', 'all_boards')),
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  model_used TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- messages: [{ "role": "user"|"assistant"|"system", "content": "...", "timestamp": "...", "tokens": 0 }]

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_card ON chat_sessions(card_id);
CREATE INDEX idx_chat_sessions_board ON chat_sessions(board_id);
CREATE INDEX idx_chat_sessions_scope ON chat_sessions(scope);
CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own chat sessions
CREATE POLICY "chat_sessions_select" ON chat_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "chat_sessions_insert" ON chat_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "chat_sessions_update" ON chat_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "chat_sessions_delete" ON chat_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================
CREATE TRIGGER set_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
