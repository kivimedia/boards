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
  console.log('Connected. Running migration 075: SEO Content Calendar...');

  // 1. Calendar generation records
  await client.query(`
    CREATE TABLE IF NOT EXISTS seo_calendars (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_config_id UUID NOT NULL REFERENCES seo_team_configs(id) ON DELETE CASCADE,
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      name TEXT NOT NULL DEFAULT 'Content Calendar',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
      date_range_start DATE NOT NULL,
      date_range_end DATE NOT NULL,
      generation_prompt TEXT,
      generation_model TEXT,
      generation_cost_usd NUMERIC(8,6) DEFAULT 0,
      items_count INTEGER DEFAULT 0,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Created seo_calendars table');

  // 2. Individual calendar items
  await client.query(`
    CREATE TABLE IF NOT EXISTS seo_calendar_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      calendar_id UUID NOT NULL REFERENCES seo_calendars(id) ON DELETE CASCADE,
      team_config_id UUID NOT NULL REFERENCES seo_team_configs(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      silo TEXT,
      keywords JSONB DEFAULT '[]',
      outline_notes TEXT,
      target_word_count INTEGER DEFAULT 1500,
      scheduled_date DATE NOT NULL,
      sort_order INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'launched', 'skipped')),
      run_id UUID REFERENCES seo_pipeline_runs(id) ON DELETE SET NULL,
      launched_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Created seo_calendar_items table');

  // 3. Indexes
  await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_calendars_config ON seo_calendars(team_config_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_calendar_items_calendar ON seo_calendar_items(calendar_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_calendar_items_config ON seo_calendar_items(team_config_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_calendar_items_date ON seo_calendar_items(scheduled_date)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_calendar_items_status ON seo_calendar_items(status)`);
  console.log('Created indexes');

  // 4. Enable RLS
  await client.query(`ALTER TABLE seo_calendars ENABLE ROW LEVEL SECURITY`);
  await client.query(`ALTER TABLE seo_calendar_items ENABLE ROW LEVEL SECURITY`);

  // 5. RLS policies
  await client.query(`DROP POLICY IF EXISTS "seo_calendars_auth_all" ON seo_calendars`);
  await client.query(`CREATE POLICY "seo_calendars_auth_all" ON seo_calendars FOR ALL USING (true) WITH CHECK (true)`);
  await client.query(`DROP POLICY IF EXISTS "seo_calendar_items_auth_all" ON seo_calendar_items`);
  await client.query(`CREATE POLICY "seo_calendar_items_auth_all" ON seo_calendar_items FOR ALL USING (true) WITH CHECK (true)`);
  console.log('RLS enabled with policies');

  console.log('Migration 075 complete!');
  await client.end();
}

run().catch(console.error);
