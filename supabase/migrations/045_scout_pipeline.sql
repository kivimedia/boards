-- ============================================================================
-- Migration 045: Scout Pipeline Steps
-- Adds multi-step support to pga_agent_runs and scout agent config
-- ============================================================================

-- 1. Add current_step column to pga_agent_runs
ALTER TABLE pga_agent_runs ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;

-- 2. Expand status CHECK to include 'awaiting_input'
ALTER TABLE pga_agent_runs DROP CONSTRAINT IF EXISTS pga_agent_runs_status_check;
ALTER TABLE pga_agent_runs ADD CONSTRAINT pga_agent_runs_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'awaiting_input'));

-- 3. Index for resumable runs
CREATE INDEX IF NOT EXISTS idx_pga_agent_runs_awaiting
  ON pga_agent_runs (agent_type, current_step)
  WHERE status = 'awaiting_input';

-- 4. Expand integration configs service CHECK to include 'scout_config' and 'trello'
ALTER TABLE pga_integration_configs DROP CONSTRAINT IF EXISTS pga_integration_configs_service_check;
ALTER TABLE pga_integration_configs ADD CONSTRAINT pga_integration_configs_service_check
  CHECK (service IN ('instantly', 'hunter', 'snov', 'calendly', 'scout_config', 'trello'));

-- 5. Seed default scout_config
INSERT INTO pga_integration_configs (service, config, is_active)
VALUES (
  'scout_config',
  '{"default_query": "vibe coding freelancer agency AI tools", "default_location": "US", "custom_location": "", "tool_focus": "Cursor, Lovable, Bolt, Replit, v0, Windsurf", "max_results": 10}',
  true
)
ON CONFLICT (service) DO NOTHING;

-- 6. Update podcast-scout agent skill system prompt
UPDATE agent_skills
SET system_prompt = E'You are a Podcast Guest Scout for the Vibe Coding Deals podcast (vibecodingdeals.co).\n\nYour mission: Find people ACTIVELY MAKING MONEY from vibe coding -- freelancers, agency owners, consultants, and builders using AI coding tools for PAID client work or products.\n\nThis scout operates in steps. Your current task will be specified in each message.\n\nSTEP 1 - LinkedIn Discovery:\nSearch LinkedIn for real profiles matching the criteria. Use site:linkedin.com/in searches with the specified location and tool focus. Return: name, headline/title, location, LinkedIn URL, one-line summary of why they match.\n\nSTEP 3 - Deep Research:\nFor each candidate, search for:\n- Their personal website or portfolio\n- Evidence of PAID work using AI/vibe coding tools (not just tutorials)\n- Social profiles (Twitter/X, YouTube, GitHub)\n- Public mentions of revenue, clients, shipped products\n- Tools they use and audience/reach\n\nQuality filters:\n- MUST have evidence of paid work (not tutorials or experiments)\n- Prefer under 50K followers (more likely to say yes)\n- Look for recent activity (last 3 months)\n\nOutput structured JSON with evidence for each candidate.',
    updated_at = now()
WHERE slug = 'podcast-scout';
