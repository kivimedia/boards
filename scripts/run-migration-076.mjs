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

await client.connect();
console.log('Connected to Supabase Postgres');

// Step 1: Add images column
try {
  await client.query(`ALTER TABLE seo_calendar_items ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;`);
  console.log('  - images column added');
} catch (e) { console.log('  - images column:', e.message); }

// Step 2: Create storage bucket (public - images will be embedded in blog posts)
try {
  await client.query(`
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('seo-calendar-images', 'seo-calendar-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log('  - storage bucket created');
} catch (e) { console.log('  - bucket:', e.message); }

// Step 3: Storage policies
const policies = [
  { name: 'seo_cal_images_upload', op: 'INSERT', check: `WITH CHECK (bucket_id = 'seo-calendar-images')` },
  { name: 'seo_cal_images_read', op: 'SELECT', check: `USING (bucket_id = 'seo-calendar-images')` },
  { name: 'seo_cal_images_delete', op: 'DELETE', check: `USING (bucket_id = 'seo-calendar-images')` },
];
for (const p of policies) {
  try {
    await client.query(`DROP POLICY IF EXISTS "${p.name}" ON storage.objects;`);
    const roles = p.op === 'SELECT' ? 'authenticated, anon' : 'authenticated';
    await client.query(`CREATE POLICY "${p.name}" ON storage.objects FOR ${p.op} TO ${roles} ${p.check};`);
    console.log(`  - policy ${p.name} created`);
  } catch (e) { console.log(`  - policy ${p.name}:`, e.message); }
}

console.log('Migration 076 complete: images column + storage bucket');

await client.end();
