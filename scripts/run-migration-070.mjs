import { readFileSync } from 'fs';
import pg from 'pg';

const env = readFileSync('C:/Users/raviv/agency-board/.env.local', 'utf8');
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : null;
};

const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const ref = url.replace('https://', '').split('.')[0];
const pw = getEnv('SUPABASE_DB_PASSWORD');

const client = new pg.Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: pw,
  ssl: { rejectUnauthorized: false },
});

const sql = `
-- Migration 070: Agent Team Templates & Runs
-- Phase 4: Generalize SEO pipeline pattern into reusable Agent Teams

-- ============================================================================
-- agent_team_templates: Reusable pipeline definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_team_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  -- phases: [{name, skill_slug, model, is_gate, gate_type, config}]
  phases JSONB NOT NULL DEFAULT '[]',
  -- default_config: template-level defaults (max_retries, default_model, etc.)
  default_config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- agent_team_runs: Execution instances of a template
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_team_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES agent_team_templates(id) ON DELETE CASCADE,
  vps_job_id UUID REFERENCES vps_jobs(id),
  -- config: runtime overrides per run
  config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  current_phase INTEGER NOT NULL DEFAULT 0,
  -- phase_results: {phase_name: {output, cost_usd, duration_ms, model, tokens}}
  phase_results JSONB NOT NULL DEFAULT '{}',
  -- artifacts: accumulated outputs (blog_post, wp_draft_url, etc.)
  artifacts JSONB NOT NULL DEFAULT '{}',
  total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  -- gate_decisions: {gate1: {decision, feedback, decided_at, decided_by}}
  gate_decisions JSONB NOT NULL DEFAULT '{}',
  -- input_data: user-provided context (topic, silo, etc.)
  input_data JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_templates_slug ON agent_team_templates(slug);
CREATE INDEX IF NOT EXISTS idx_team_templates_active ON agent_team_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_team_runs_template ON agent_team_runs(template_id);
CREATE INDEX IF NOT EXISTS idx_team_runs_status ON agent_team_runs(status);
CREATE INDEX IF NOT EXISTS idx_team_runs_vps_job ON agent_team_runs(vps_job_id);
CREATE INDEX IF NOT EXISTS idx_team_runs_created_at ON agent_team_runs(created_at DESC);

-- RLS policies
ALTER TABLE agent_team_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_team_runs ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "service_role_all_team_templates" ON agent_team_templates
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_team_runs" ON agent_team_runs
  FOR ALL USING (auth.role() = 'service_role');

-- Authenticated users can read templates
CREATE POLICY "auth_read_team_templates" ON agent_team_templates
  FOR SELECT USING (auth.role() = 'authenticated');

-- Authenticated users can read their own runs
CREATE POLICY "auth_read_own_team_runs" ON agent_team_runs
  FOR SELECT USING (auth.uid() = created_by);

-- Authenticated users can insert runs
CREATE POLICY "auth_insert_team_runs" ON agent_team_runs
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Authenticated users can update their own runs (for gate decisions)
CREATE POLICY "auth_update_own_team_runs" ON agent_team_runs
  FOR UPDATE USING (auth.uid() = created_by);

-- ============================================================================
-- Seed SEO team as the first template
-- ============================================================================
INSERT INTO agent_team_templates (slug, name, description, icon, phases, default_config, is_active)
VALUES (
  'seo-content-pipeline',
  'SEO Content Pipeline',
  'Automated blog post production: strategy planning, writing, QC, humanizing, scoring, publishing, and visual QA with two approval gates.',
  'DocumentText',
  '[
    {"name": "planning", "skill_slug": "seo-strategy-planner", "model": "claude-sonnet-4-5-20250929", "is_gate": false},
    {"name": "writing", "skill_slug": "seo-content-writer", "model": "claude-sonnet-4-5-20250929", "is_gate": false},
    {"name": "qc", "skill_slug": "seo-quality-control", "model": "claude-sonnet-4-5-20250929", "is_gate": false},
    {"name": "humanizing", "skill_slug": "seo-humanizer", "model": "claude-sonnet-4-5-20250929", "is_gate": false},
    {"name": "scoring", "skill_slug": "seo-value-scorer", "model": "claude-sonnet-4-5-20250929", "is_gate": false},
    {"name": "gate1", "skill_slug": null, "model": null, "is_gate": true, "gate_type": "content_review", "gate_label": "Content Review"},
    {"name": "publishing", "skill_slug": "seo-wordpress-publisher", "model": "claude-sonnet-4-5-20250929", "is_gate": false},
    {"name": "visual_qa", "skill_slug": "seo-visual-qa", "model": "claude-sonnet-4-5-20250929", "is_gate": false},
    {"name": "gate2", "skill_slug": null, "model": null, "is_gate": true, "gate_type": "published_review", "gate_label": "Published Post Review"}
  ]'::jsonb,
  '{"max_retries": 2, "default_model": "claude-sonnet-4-5-20250929"}'::jsonb,
  true
)
ON CONFLICT (slug) DO NOTHING;
`;

async function main() {
  await client.connect();
  console.log('Running migration 070: Agent Team Templates & Runs...');
  await client.query(sql);
  console.log('Migration 070 complete.');

  // Verify
  const { rows: templates } = await client.query('SELECT slug, name FROM agent_team_templates');
  console.log('Templates:', templates);

  const { rows: runs } = await client.query('SELECT count(*) FROM agent_team_runs');
  console.log('Team runs:', runs[0].count);

  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
