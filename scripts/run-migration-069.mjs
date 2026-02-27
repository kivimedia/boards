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

async function run() {
  await client.connect();
  console.log('Connected to database');

  // ── Step 1: vps_jobs table ──
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS vps_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER DEFAULT 0,

        payload JSONB NOT NULL DEFAULT '{}',
        user_id TEXT NOT NULL,
        board_id UUID,
        card_id UUID,
        client_id UUID,

        current_step INTEGER DEFAULT 0,
        total_steps INTEGER DEFAULT 1,
        progress_message TEXT,
        progress_data JSONB,

        output JSONB,
        output_preview TEXT,
        error_message TEXT,

        cost_usd NUMERIC(10,4) DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('1. Created vps_jobs table');
  } catch (e) { console.log('1.', e.message); }

  // ── Step 2: vps_jobs indexes ──
  try {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vps_jobs_pending ON vps_jobs(status) WHERE status IN ('pending', 'queued')`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vps_jobs_user ON vps_jobs(user_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_vps_jobs_board ON vps_jobs(board_id, created_at DESC)`);
    console.log('2. Created vps_jobs indexes');
  } catch (e) { console.log('2.', e.message); }

  // ── Step 3: seo_team_configs table ──
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS seo_team_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
        site_url TEXT NOT NULL,
        site_name TEXT NOT NULL,

        wp_credentials JSONB,
        slack_credentials JSONB,
        google_credentials JSONB,

        config JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE(client_id)
      )
    `);
    console.log('3. Created seo_team_configs table');
  } catch (e) { console.log('3.', e.message); }

  // ── Step 4: seo_pipeline_runs table ──
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS seo_pipeline_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        team_config_id UUID REFERENCES seo_team_configs(id) ON DELETE SET NULL,
        vps_job_id UUID REFERENCES vps_jobs(id) ON DELETE SET NULL,
        post_id TEXT UNIQUE,

        status TEXT NOT NULL DEFAULT 'planning',
        current_phase INTEGER DEFAULT 0,
        phase_results JSONB DEFAULT '{}',
        artifacts JSONB DEFAULT '{}',
        error_log JSONB DEFAULT '[]',

        topic TEXT,
        silo TEXT,
        assignment TEXT,

        final_content TEXT,
        humanized_content TEXT,
        wp_post_id INTEGER,
        wp_preview_url TEXT,
        wp_live_url TEXT,

        qc_score NUMERIC(5,2),
        value_score NUMERIC(5,2),
        visual_qa_score NUMERIC(5,2),
        total_cost_usd NUMERIC(10,4) DEFAULT 0,
        agent_costs JSONB DEFAULT '{}',

        gate1_decision TEXT,
        gate1_feedback TEXT,
        gate1_decided_by TEXT,
        gate1_decided_at TIMESTAMPTZ,
        gate2_decision TEXT,
        gate2_feedback TEXT,
        gate2_decided_by TEXT,
        gate2_decided_at TIMESTAMPTZ,

        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        published_at TIMESTAMPTZ
      )
    `);
    console.log('4. Created seo_pipeline_runs table');
  } catch (e) { console.log('4.', e.message); }

  // ── Step 5: seo_pipeline_runs indexes ──
  try {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_runs_status ON seo_pipeline_runs(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_runs_config ON seo_pipeline_runs(team_config_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_runs_awaiting ON seo_pipeline_runs(status) WHERE status LIKE 'awaiting_%'`);
    console.log('5. Created seo_pipeline_runs indexes');
  } catch (e) { console.log('5.', e.message); }

  // ── Step 6: seo_agent_calls table ──
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS seo_agent_calls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pipeline_run_id UUID REFERENCES seo_pipeline_runs(id) ON DELETE CASCADE,
        agent_name TEXT NOT NULL,
        phase TEXT NOT NULL,

        model_used TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost_usd NUMERIC(10,6) DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,

        iteration INTEGER DEFAULT 1,
        input_preview TEXT,
        output_preview TEXT,
        status TEXT DEFAULT 'success',
        error_message TEXT,

        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('6. Created seo_agent_calls table');
  } catch (e) { console.log('6.', e.message); }

  // ── Step 7: seo_agent_calls indexes ──
  try {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_calls_run ON seo_agent_calls(pipeline_run_id, created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_calls_agent ON seo_agent_calls(agent_name)`);
    console.log('7. Created seo_agent_calls indexes');
  } catch (e) { console.log('7.', e.message); }

  // ── Step 8: RLS policies ──
  const tables = ['vps_jobs', 'seo_team_configs', 'seo_pipeline_runs', 'seo_agent_calls'];
  for (const table of tables) {
    try {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await client.query(`
        CREATE POLICY IF NOT EXISTS "${table}_auth_all" ON ${table}
        FOR ALL USING (true) WITH CHECK (true)
      `);
      console.log(`8. RLS enabled for ${table}`);
    } catch (e) { console.log(`8. ${table} RLS:`, e.message); }
  }

  // ── Step 9: updated_at triggers ──
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);
    for (const table of ['vps_jobs', 'seo_team_configs', 'seo_pipeline_runs']) {
      await client.query(`
        DROP TRIGGER IF EXISTS set_updated_at ON ${table};
        CREATE TRIGGER set_updated_at BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `);
    }
    console.log('9. Created updated_at triggers');
  } catch (e) { console.log('9.', e.message); }

  console.log('\nMigration 069 complete!');
  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
