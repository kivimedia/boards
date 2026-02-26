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

  // Step 1: Update handle_new_user trigger to auto-create a clients record
  // when user_role='client' and no client_id is provided in metadata.
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger AS $$
      DECLARE
        _client_id UUID;
        _user_role TEXT;
      BEGIN
        _user_role := COALESCE(new.raw_user_meta_data->>'user_role', 'member');
        _client_id := (new.raw_user_meta_data->>'client_id')::UUID;

        -- Auto-create a clients record for client-type users without an existing client
        IF _user_role = 'client' AND _client_id IS NULL THEN
          INSERT INTO public.clients (name, email, created_by)
          VALUES (
            COALESCE(new.raw_user_meta_data->>'display_name', new.email),
            new.email,
            new.id
          )
          RETURNING id INTO _client_id;
        END IF;

        INSERT INTO public.profiles (id, display_name, avatar_url, role, user_role, account_status, client_id)
        VALUES (
          new.id,
          COALESCE(new.raw_user_meta_data->>'display_name', new.email),
          new.raw_user_meta_data->>'avatar_url',
          _user_role,
          (_user_role)::public.user_role,
          CASE
            WHEN _user_role = 'client' THEN 'active'::public.account_status_enum
            ELSE 'pending'::public.account_status_enum
          END,
          _client_id
        );
        RETURN new;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    `);
    console.log('1. Updated handle_new_user trigger — now auto-creates clients record');
  } catch (e) {
    console.error('1. FAILED:', e.message);
  }

  // Step 2: Backfill — find any client-type profiles with no client_id and create clients records
  try {
    const { rows } = await client.query(`
      SELECT p.id, p.display_name, au.email
      FROM profiles p
      JOIN auth.users au ON au.id = p.id
      WHERE p.user_role = 'client' AND p.client_id IS NULL
    `);
    console.log(`2. Found ${rows.length} orphaned client profile(s) to backfill`);

    for (const row of rows) {
      const { rows: inserted } = await client.query(
        `INSERT INTO clients (name, email, created_by) VALUES ($1, $2, $3) RETURNING id`,
        [row.display_name || row.email, row.email, row.id]
      );
      await client.query(
        `UPDATE profiles SET client_id = $1 WHERE id = $2`,
        [inserted[0].id, row.id]
      );
      console.log(`   Backfilled: ${row.email} → client ${inserted[0].id}`);
    }
  } catch (e) {
    console.error('2. Backfill error:', e.message);
  }

  console.log('\nMigration 068 complete!');
  await client.end();
}

run().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
