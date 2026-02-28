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

  // Step 1: Drop UNIQUE(client_id) on seo_team_configs
  // This allows multiple site configs per client
  try {
    await client.query(`ALTER TABLE seo_team_configs DROP CONSTRAINT IF EXISTS seo_team_configs_client_id_key`);
    console.log('1. Dropped UNIQUE(client_id) constraint on seo_team_configs');
  } catch (e) { console.log('1.', e.message); }

  // Step 2: Add client_id to seo_pipeline_runs for direct filtering
  try {
    await client.query(`ALTER TABLE seo_pipeline_runs ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_runs_client ON seo_pipeline_runs(client_id)`);
    console.log('2. Added client_id to seo_pipeline_runs');
  } catch (e) { console.log('2.', e.message); }

  // Step 3: Backfill client_id on existing seo_pipeline_runs
  try {
    const { rowCount } = await client.query(`
      UPDATE seo_pipeline_runs r
      SET client_id = c.client_id
      FROM seo_team_configs c
      WHERE r.team_config_id = c.id AND r.client_id IS NULL
    `);
    console.log(`3. Backfilled client_id on ${rowCount} seo_pipeline_runs`);
  } catch (e) { console.log('3.', e.message); }

  // Step 4: Add client_id and site_config_id to agent_team_runs
  try {
    await client.query(`ALTER TABLE agent_team_runs ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL`);
    await client.query(`ALTER TABLE agent_team_runs ADD COLUMN IF NOT EXISTS site_config_id UUID REFERENCES seo_team_configs(id) ON DELETE SET NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_team_runs_client ON agent_team_runs(client_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_team_runs_site_config ON agent_team_runs(site_config_id)`);
    console.log('4. Added client_id and site_config_id to agent_team_runs');
  } catch (e) { console.log('4.', e.message); }

  // Step 5: Add index on seo_team_configs(client_id) for filtering configs by client
  try {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_configs_client ON seo_team_configs(client_id)`);
    console.log('5. Added index on seo_team_configs(client_id)');
  } catch (e) { console.log('5.', e.message); }

  console.log('\nMigration 073 complete!');
  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
