-- Migration 039: Agent Skills System
-- Adds AI agent/skill management with quality dashboard, execution tracking,
-- and card-level agent task integration.
-- Supports 16 marketing skills (Skills Pack + Creative Pack) as persistent,
-- board-scoped agents with quality ratings and improvement tracking.

-- ============================================================================
-- 1. AGENT SKILL DEFINITIONS (global skill library)
-- ============================================================================

CREATE TABLE agent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,                          -- e.g. 'direct-response-copy'
  name TEXT NOT NULL,                                 -- e.g. 'Direct Response Copy'
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',            -- 'content', 'creative', 'strategy', 'seo', 'meta'
  pack TEXT NOT NULL DEFAULT 'custom',                 -- 'skills', 'creative', 'custom'

  -- The actual skill prompt/instructions (the Skill.md content)
  system_prompt TEXT NOT NULL,

  -- Quality assessment (your dashboard data)
  quality_tier TEXT NOT NULL DEFAULT 'solid'
    CHECK (quality_tier IN ('genuinely_smart', 'solid', 'has_potential', 'placeholder', 'tool_dependent')),
  quality_score INTEGER NOT NULL DEFAULT 50
    CHECK (quality_score BETWEEN 0 AND 100),
  quality_notes TEXT,                                  -- free-form assessment notes
  strengths TEXT[] NOT NULL DEFAULT '{}',              -- what makes it smart
  weaknesses TEXT[] NOT NULL DEFAULT '{}',             -- what holds it back
  improvement_suggestions TEXT[] NOT NULL DEFAULT '{}',-- actionable fixes
  last_quality_review_at TIMESTAMPTZ,

  -- Capabilities
  supported_tools TEXT[] NOT NULL DEFAULT '{}',        -- tools this skill can use
  required_context TEXT[] NOT NULL DEFAULT '{}',       -- what context it needs (brand_voice, product_info, etc.)
  output_format TEXT NOT NULL DEFAULT 'markdown',      -- 'markdown', 'json', 'html'
  estimated_tokens INTEGER NOT NULL DEFAULT 2000,      -- typical output size

  -- Dependencies on other skills
  depends_on TEXT[] NOT NULL DEFAULT '{}',             -- slugs of prerequisite skills
  feeds_into TEXT[] NOT NULL DEFAULT '{}',             -- slugs of skills that use this output

  -- Tool dependencies (for creative skills)
  requires_mcp_tools TEXT[] NOT NULL DEFAULT '{}',     -- e.g. ['glif', 'replicate']
  fallback_behavior TEXT,                              -- what to do without MCP tools

  -- Reference material
  reference_docs JSONB NOT NULL DEFAULT '[]',          -- [{name, content_summary, quality}]

  -- Metadata
  version TEXT NOT NULL DEFAULT '1.0.0',
  is_active BOOLEAN NOT NULL DEFAULT true,
  icon TEXT,                                           -- emoji or icon name
  color TEXT,                                          -- hex color for UI
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. BOARD AGENTS (skill instances on boards)
-- ============================================================================

CREATE TABLE board_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,

  -- Override the global skill config per board
  custom_prompt_additions TEXT,                        -- board-specific prompt additions
  custom_tools TEXT[],                                 -- override tool list (NULL = use skill default)
  model_preference TEXT,                               -- 'anthropic' | 'openai' | 'google' or NULL

  -- Execution settings
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_trigger_on TEXT[] NOT NULL DEFAULT '{}',        -- card events that auto-trigger: 'card_created', 'card_moved', etc.
  max_iterations INTEGER NOT NULL DEFAULT 5,
  requires_confirmation BOOLEAN NOT NULL DEFAULT true,

  -- Board-level stats (denormalized for dashboard)
  total_executions INTEGER NOT NULL DEFAULT 0,
  successful_executions INTEGER NOT NULL DEFAULT 0,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  avg_quality_rating NUMERIC(3,2),                    -- user-rated quality of outputs (1-5)
  last_executed_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(board_id, skill_id)                          -- one instance per skill per board
);

-- ============================================================================
-- 3. AGENT EXECUTIONS (execution history / audit log)
-- ============================================================================

CREATE TABLE agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_agent_id UUID NOT NULL REFERENCES board_agents(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Trigger info
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'automation_rule', 'card_event', 'schedule', 'chained')),
  trigger_data JSONB NOT NULL DEFAULT '{}',

  -- Input/Output
  input_message TEXT NOT NULL,
  input_context JSONB NOT NULL DEFAULT '{}',           -- context snapshot passed to the agent
  output_response TEXT,                                -- the agent's output
  output_artifacts JSONB NOT NULL DEFAULT '[]',        -- [{type, content, filename}]

  -- Execution metadata
  model_used TEXT,
  iterations_used INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  duration_ms INTEGER,

  -- Status
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed', 'cancelled', 'pending_confirmation')),
  error_message TEXT,

  -- User feedback
  quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5),
  quality_feedback TEXT,
  was_useful BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- 4. AGENT TOOL CALLS (detailed tool usage per execution)
-- ============================================================================

CREATE TABLE agent_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,

  tool_name TEXT NOT NULL,
  tool_input JSONB NOT NULL,
  tool_result JSONB,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed', 'pending_confirmation', 'confirmed', 'rejected')),
  error_message TEXT,

  -- Confirmation tracking
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,

  call_order INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. CARD AGENT TASKS (agent tasks attached to cards)
-- ============================================================================

CREATE TABLE card_agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,

  -- Task definition
  title TEXT NOT NULL,                                 -- e.g. "Generate brand voice profile"
  input_prompt TEXT,                                   -- user's instructions for this task

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

  -- Output
  output_preview TEXT,                                 -- first ~500 chars of output
  output_full TEXT,                                    -- complete output
  output_artifacts JSONB NOT NULL DEFAULT '[]',

  -- User feedback
  quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5),
  was_applied BOOLEAN DEFAULT false,                   -- did the user actually use the output?

  -- Ordering
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- 6. SKILL IMPROVEMENT LOG (track improvements over time)
-- ============================================================================

CREATE TABLE skill_improvement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,

  change_type TEXT NOT NULL
    CHECK (change_type IN ('prompt_update', 'quality_review', 'reference_added', 'bug_fix', 'feature_add', 'rewrite')),
  change_description TEXT NOT NULL,

  -- Before/after quality
  quality_score_before INTEGER,
  quality_score_after INTEGER,
  quality_tier_before TEXT,
  quality_tier_after TEXT,

  -- Who & when
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7. INDEXES
-- ============================================================================

CREATE INDEX idx_agent_skills_category ON agent_skills(category);
CREATE INDEX idx_agent_skills_pack ON agent_skills(pack);
CREATE INDEX idx_agent_skills_quality ON agent_skills(quality_tier, quality_score DESC);
CREATE INDEX idx_agent_skills_active ON agent_skills(is_active) WHERE is_active = true;

CREATE INDEX idx_board_agents_board ON board_agents(board_id);
CREATE INDEX idx_board_agents_skill ON board_agents(skill_id);
CREATE INDEX idx_board_agents_active ON board_agents(board_id, is_active) WHERE is_active = true;

CREATE INDEX idx_agent_executions_board_agent ON agent_executions(board_agent_id);
CREATE INDEX idx_agent_executions_card ON agent_executions(card_id);
CREATE INDEX idx_agent_executions_user ON agent_executions(user_id);
CREATE INDEX idx_agent_executions_status ON agent_executions(status);
CREATE INDEX idx_agent_executions_created ON agent_executions(created_at DESC);
CREATE INDEX idx_agent_executions_skill ON agent_executions(skill_id);

CREATE INDEX idx_agent_tool_calls_exec ON agent_tool_calls(execution_id);

CREATE INDEX idx_card_agent_tasks_card ON card_agent_tasks(card_id);
CREATE INDEX idx_card_agent_tasks_skill ON card_agent_tasks(skill_id);
CREATE INDEX idx_card_agent_tasks_status ON card_agent_tasks(status);

CREATE INDEX idx_skill_improvement_log_skill ON skill_improvement_log(skill_id);
CREATE INDEX idx_skill_improvement_log_created ON skill_improvement_log(created_at DESC);

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_improvement_log ENABLE ROW LEVEL SECURITY;

-- Agent skills are readable by all authenticated users
CREATE POLICY "agent_skills_read" ON agent_skills
  FOR SELECT TO authenticated USING (true);

-- Only admins can modify global skills
CREATE POLICY "agent_skills_admin_write" ON agent_skills
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Board agents: readable by board members, writable by admin/department_lead
CREATE POLICY "board_agents_read" ON board_agents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM board_members WHERE board_id = board_agents.board_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "board_agents_write" ON board_agents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM board_members
      WHERE board_id = board_agents.board_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'department_lead')
    )
  );

-- Executions: readable by board members
CREATE POLICY "agent_executions_read" ON agent_executions
  FOR SELECT TO authenticated
  USING (
    board_id IS NULL OR EXISTS (
      SELECT 1 FROM board_members WHERE board_id = agent_executions.board_id AND user_id = auth.uid()
    )
  );

-- Executions: writable by the user who triggered them
CREATE POLICY "agent_executions_write" ON agent_executions
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Tool calls: same as execution parent
CREATE POLICY "agent_tool_calls_read" ON agent_tool_calls
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_executions ae
      WHERE ae.id = agent_tool_calls.execution_id
        AND (ae.board_id IS NULL OR EXISTS (
          SELECT 1 FROM board_members WHERE board_id = ae.board_id AND user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "agent_tool_calls_write" ON agent_tool_calls
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_executions ae
      WHERE ae.id = agent_tool_calls.execution_id AND ae.user_id = auth.uid()
    )
  );

-- Card agent tasks: readable/writable by board members (via card → placement → list → board)
CREATE POLICY "card_agent_tasks_read" ON card_agent_tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM card_placements cp
      JOIN lists l ON l.id = cp.list_id
      JOIN board_members bm ON bm.board_id = l.board_id
      WHERE cp.card_id = card_agent_tasks.card_id AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "card_agent_tasks_write" ON card_agent_tasks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM card_placements cp
      JOIN lists l ON l.id = cp.list_id
      JOIN board_members bm ON bm.board_id = l.board_id
      WHERE cp.card_id = card_agent_tasks.card_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'department_lead', 'member')
    )
  );

-- Improvement log: readable by all, writable by admins
CREATE POLICY "skill_improvement_log_read" ON skill_improvement_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "skill_improvement_log_write" ON skill_improvement_log
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- 9. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_skills_updated_at
  BEFORE UPDATE ON agent_skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER board_agents_updated_at
  BEFORE UPDATE ON board_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 10. STATS UPDATE FUNCTION (called after execution completes)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_board_agent_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('success', 'failed') AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    UPDATE board_agents SET
      total_executions = total_executions + 1,
      successful_executions = CASE WHEN NEW.status = 'success'
        THEN successful_executions + 1 ELSE successful_executions END,
      total_tokens_used = total_tokens_used + COALESCE(NEW.input_tokens, 0) + COALESCE(NEW.output_tokens, 0),
      total_cost_usd = total_cost_usd + COALESCE(NEW.cost_usd, 0),
      last_executed_at = now(),
      avg_quality_rating = (
        SELECT AVG(quality_rating)::NUMERIC(3,2)
        FROM agent_executions
        WHERE board_agent_id = NEW.board_agent_id AND quality_rating IS NOT NULL
      )
    WHERE id = NEW.board_agent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_execution_stats_update
  AFTER UPDATE ON agent_executions
  FOR EACH ROW EXECUTE FUNCTION update_board_agent_stats();
