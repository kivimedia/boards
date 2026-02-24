const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// First create an exec_sql function, then use it to run the migration
async function supabaseRPC(fnName, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

// Direct query via PostgREST (only works for SELECT queries on existing tables)
async function queryTable(table, select = '*', filters = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${filters}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

(async () => {
  console.log('Checking if agent_skills table exists...');
  const existing = await queryTable('agent_skills', 'id', '&limit=1');
  if (existing !== null) {
    console.log('agent_skills table already exists! Migration already applied.');

    // Count rows
    const skills = await queryTable('agent_skills', 'id');
    console.log(`Found ${skills?.length ?? 0} skills in the table.`);
    return;
  }

  console.log('Table does not exist. Need to apply migration 039.');
  console.log('\nThe Supabase hosted API does not support raw SQL execution.');
  console.log('You need to run this migration via one of these methods:\n');
  console.log('1. Supabase Dashboard SQL Editor:');
  console.log('   https://supabase.com/dashboard/project/uqoogrnrzfsurupqkgco/sql/new');
  console.log('   Copy-paste the contents of supabase/migrations/039_agent_skills_system.sql\n');
  console.log('2. Direct psql connection (if you have the DB password):');
  console.log('   psql "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"');
  console.log('   \\i supabase/migrations/039_agent_skills_system.sql\n');
  console.log('3. Supabase CLI with access token:');
  console.log('   npx supabase login');
  console.log('   npx supabase link --project-ref uqoogrnrzfsurupqkgco');
  console.log('   npx supabase db push');
})();
