-- Migration 059: Skill Revision History
-- Stores full snapshots of agent_skills before each edit, enabling
-- revision history display and one-click restore.

CREATE TABLE IF NOT EXISTS skill_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,

  -- Who made the edit that produced this snapshot
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Auto-generated list of which fields changed (e.g. "system_prompt, quality_score")
  change_summary TEXT,

  -- Full snapshot of the skill BEFORE the edit
  snapshot JSONB NOT NULL,

  -- Sequential revision counter per skill
  revision_number INTEGER NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skill_revisions_skill
  ON skill_revisions(skill_id, revision_number DESC);

CREATE INDEX IF NOT EXISTS idx_skill_revisions_created
  ON skill_revisions(created_at DESC);

-- RLS (mirrors skill_improvement_log pattern from migration 039)
ALTER TABLE skill_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skill_revisions_read" ON skill_revisions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "skill_revisions_write" ON skill_revisions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
