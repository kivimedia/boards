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

  // Step 1: Add enum value (must be outside transaction)
  try {
    await client.query(`ALTER TYPE board_type ADD VALUE IF NOT EXISTS 'client_board'`);
    console.log('1. Added client_board enum value');
  } catch (e) {
    console.log('1. Enum:', e.message);
  }

  // Step 2: profiles.client_id
  try {
    await client.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL`);
    console.log('2. Added profiles.client_id');
  } catch (e) { console.log('2.', e.message); }

  try {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON profiles(client_id) WHERE client_id IS NOT NULL`);
    console.log('3. Created profiles client_id index');
  } catch (e) { console.log('3.', e.message); }

  // Step 3: boards.client_id
  try {
    await client.query(`ALTER TABLE boards ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL`);
    console.log('4. Added boards.client_id');
  } catch (e) { console.log('4.', e.message); }

  try {
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_client_board ON boards(client_id) WHERE client_id IS NOT NULL AND type = 'client_board'`);
    console.log('5. Created boards unique client_board index');
  } catch (e) { console.log('5.', e.message); }

  // Step 4: client_api_keys table
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini')),
        api_key_encrypted TEXT NOT NULL,
        label TEXT,
        created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(client_id, provider)
      )
    `);
    console.log('6. Created client_api_keys table');
  } catch (e) { console.log('6.', e.message); }

  try {
    await client.query(`CREATE INDEX IF NOT EXISTS idx_client_api_keys_client ON client_api_keys(client_id)`);
    console.log('7. Created client_api_keys index');
  } catch (e) { console.log('7.', e.message); }

  try {
    await client.query(`ALTER TABLE client_api_keys ENABLE ROW LEVEL SECURITY`);
    console.log('8. Enabled RLS on client_api_keys');
  } catch (e) { console.log('8.', e.message); }

  // RLS policies
  const condition = `(
    (SELECT user_role FROM profiles WHERE id = auth.uid()) != 'client'
    OR client_id = (SELECT client_id FROM profiles WHERE id = auth.uid())
  )`;

  const policies = [
    { name: 'client_api_keys_select', op: 'SELECT', clause: 'USING' },
    { name: 'client_api_keys_insert', op: 'INSERT', clause: 'WITH CHECK' },
    { name: 'client_api_keys_update', op: 'UPDATE', clause: 'USING' },
    { name: 'client_api_keys_delete', op: 'DELETE', clause: 'USING' },
  ];

  for (const p of policies) {
    try {
      await client.query(`CREATE POLICY "${p.name}" ON client_api_keys FOR ${p.op} TO authenticated ${p.clause} ${condition}`);
      console.log(`9. Created policy ${p.name}`);
    } catch (e) { console.log(`9. Policy ${p.name}: ${e.message}`); }
  }

  // Updated_at trigger
  try {
    await client.query(`CREATE TRIGGER set_client_api_keys_updated_at BEFORE UPDATE ON client_api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at()`);
    console.log('10. Created updated_at trigger');
  } catch (e) { console.log('10.', e.message); }

  // handle_new_user trigger function
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS trigger AS $$
      BEGIN
        INSERT INTO public.profiles (id, display_name, avatar_url, role, user_role, account_status, client_id)
        VALUES (
          new.id,
          COALESCE(new.raw_user_meta_data->>'display_name', new.email),
          new.raw_user_meta_data->>'avatar_url',
          COALESCE(new.raw_user_meta_data->>'user_role', 'member'),
          COALESCE((new.raw_user_meta_data->>'user_role')::user_role, 'member'),
          CASE
            WHEN new.raw_user_meta_data->>'user_role' = 'client' THEN 'active'::account_status_enum
            ELSE 'pending'::account_status_enum
          END,
          (new.raw_user_meta_data->>'client_id')::UUID
        );
        RETURN new;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER
    `);
    console.log('11. Updated handle_new_user trigger function');
  } catch (e) { console.log('11.', e.message); }

  // Seed board_role_access
  try {
    await client.query(`
      INSERT INTO board_role_access (board_type, agency_role) VALUES
        ('client_board', 'agency_owner'),
        ('client_board', 'account_manager'),
        ('client_board', 'executive_assistant')
      ON CONFLICT DO NOTHING
    `);
    console.log('12. Seeded board_role_access for client_board');
  } catch (e) { console.log('12.', e.message); }

  console.log('\nMigration 067 complete!');
  await client.end();
}

run().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
