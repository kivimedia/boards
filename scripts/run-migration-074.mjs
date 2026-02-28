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

  // Step 1: Create seo_phase_feedback table
  await client.query(`
    CREATE TABLE IF NOT EXISTS seo_phase_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID NOT NULL REFERENCES seo_pipeline_runs(id) ON DELETE CASCADE,
      phase TEXT NOT NULL,
      round INTEGER NOT NULL DEFAULT 1,
      feedback_text TEXT,
      decision TEXT NOT NULL CHECK (decision IN ('approve', 'revise', 'scrap')),
      decided_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_phase_feedback_run ON seo_phase_feedback(run_id, phase)`);
  console.log('1. Created seo_phase_feedback table');

  // Step 2: Create seo_review_attachments table
  await client.query(`
    CREATE TABLE IF NOT EXISTS seo_review_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      feedback_id UUID REFERENCES seo_phase_feedback(id) ON DELETE CASCADE,
      run_id UUID NOT NULL REFERENCES seo_pipeline_runs(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      uploaded_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_review_attachments_run ON seo_review_attachments(run_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_seo_review_attachments_feedback ON seo_review_attachments(feedback_id)`);
  console.log('2. Created seo_review_attachments table');

  // Step 3: Add plan review columns to seo_pipeline_runs
  await client.query(`ALTER TABLE seo_pipeline_runs ADD COLUMN IF NOT EXISTS plan_review_round INTEGER DEFAULT 0`);
  await client.query(`ALTER TABLE seo_pipeline_runs ADD COLUMN IF NOT EXISTS plan_review_decision TEXT`);
  await client.query(`ALTER TABLE seo_pipeline_runs ADD COLUMN IF NOT EXISTS plan_review_feedback TEXT`);
  console.log('3. Added plan_review columns to seo_pipeline_runs');

  // Step 4: Create Supabase Storage bucket for review attachments
  try {
    await client.query(`INSERT INTO storage.buckets (id, name, public) VALUES ('seo-review-attachments', 'seo-review-attachments', false) ON CONFLICT (id) DO NOTHING`);
    console.log('4. Created storage bucket seo-review-attachments');
  } catch (e) {
    console.log('4. Storage bucket already exists or could not be created:', e.message);
  }

  // Step 5: RLS policies for the new tables
  await client.query(`ALTER TABLE seo_phase_feedback ENABLE ROW LEVEL SECURITY`);
  await client.query(`ALTER TABLE seo_review_attachments ENABLE ROW LEVEL SECURITY`);

  // Allow authenticated users to read/write feedback
  await client.query(`
    CREATE POLICY IF NOT EXISTS "Users can read feedback" ON seo_phase_feedback FOR SELECT TO authenticated USING (true)
  `).catch(() => {});
  await client.query(`
    CREATE POLICY IF NOT EXISTS "Users can insert feedback" ON seo_phase_feedback FOR INSERT TO authenticated WITH CHECK (true)
  `).catch(() => {});
  await client.query(`
    CREATE POLICY IF NOT EXISTS "Users can read attachments" ON seo_review_attachments FOR SELECT TO authenticated USING (true)
  `).catch(() => {});
  await client.query(`
    CREATE POLICY IF NOT EXISTS "Users can insert attachments" ON seo_review_attachments FOR INSERT TO authenticated WITH CHECK (true)
  `).catch(() => {});
  await client.query(`
    CREATE POLICY IF NOT EXISTS "Users can update attachments" ON seo_review_attachments FOR UPDATE TO authenticated USING (true)
  `).catch(() => {});

  // Storage policies for the bucket
  try {
    await client.query(`
      CREATE POLICY IF NOT EXISTS "Authenticated users can upload review images"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'seo-review-attachments')
    `);
    await client.query(`
      CREATE POLICY IF NOT EXISTS "Authenticated users can read review images"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'seo-review-attachments')
    `);
    console.log('5. Created RLS policies');
  } catch (e) {
    console.log('5. RLS policies (some may already exist):', e.message);
  }

  console.log('\nMigration 074 complete!');
  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
