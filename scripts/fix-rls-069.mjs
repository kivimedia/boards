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
  const tables = ['vps_jobs', 'seo_team_configs', 'seo_pipeline_runs', 'seo_agent_calls'];
  for (const t of tables) {
    try {
      await client.query(`DROP POLICY IF EXISTS "${t}_auth_all" ON ${t}`);
      await client.query(`CREATE POLICY "${t}_auth_all" ON ${t} FOR ALL USING (true) WITH CHECK (true)`);
      console.log(`RLS policy created for ${t}`);
    } catch (e) {
      console.log(`${t}: ${e.message}`);
    }
  }
  await client.end();
}

run().catch(console.error);
