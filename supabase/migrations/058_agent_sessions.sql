-- Agent sessions: persistent multi-turn conversations for standalone agent execution
CREATE TABLE agent_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id    UUID        NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,
  board_id    UUID        REFERENCES boards(id) ON DELETE SET NULL,

  -- Display
  title       TEXT        NOT NULL,

  -- Conversation state
  message_history JSONB   NOT NULL DEFAULT '[]',
  system_prompt   TEXT    NOT NULL DEFAULT '',

  -- Accumulated stats
  total_input_tokens  INTEGER   NOT NULL DEFAULT 0,
  total_output_tokens INTEGER   NOT NULL DEFAULT 0,
  total_cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
  turn_count          INTEGER   NOT NULL DEFAULT 0,
  tool_call_count     INTEGER   NOT NULL DEFAULT 0,

  -- Status
  status        TEXT      NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'running', 'cancelled', 'error')),
  error_message TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_sessions_user ON agent_sessions(user_id, updated_at DESC);
CREATE INDEX idx_agent_sessions_status ON agent_sessions(status) WHERE status = 'running';

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_sessions_select" ON agent_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "agent_sessions_insert" ON agent_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "agent_sessions_update" ON agent_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "agent_sessions_delete" ON agent_sessions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER agent_sessions_updated_at
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
