const fs = require('fs');

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = supabaseUrl.split('//')[1].split('.')[0];

  const sql = fs.readFileSync('supabase/migrations/057_performance_keeping.sql', 'utf8');

  // Use Supabase Management API to run SQL
  // This requires the service role key to connect directly
  // Try the /pg endpoint which some Supabase setups have

  // First approach: Use the Supabase postgres connection via the pooler
  const { Client } = require('pg');

  // Supabase direct connection format
  const connectionString = `postgresql://postgres.${projectRef}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;

  console.log('Connecting to Supabase Postgres via pooler (port 5432)...');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected!');

    // Run the full migration as one transaction
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    console.log('Migration 057 applied successfully!');
  } catch (e) {
    console.error('Error:', e.message);

    // Try alternative connection
    console.log('\nTrying alternative connection (port 6543 session mode)...');
    const client2 = new Client({
      connectionString: `postgresql://postgres.${projectRef}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client2.connect();
      console.log('Connected via session mode!');
      await client2.query('BEGIN');
      await client2.query(sql);
      await client2.query('COMMIT');
      console.log('Migration 057 applied successfully!');
      await client2.end();
    } catch (e2) {
      console.error('Alt connection error:', e2.message);
      console.log('\n=== MANUAL APPLY NEEDED ===');
      console.log('Open Supabase SQL Editor:');
      console.log(`  https://supabase.com/dashboard/project/${projectRef}/sql/new`);
      console.log('Paste the contents of: supabase/migrations/057_performance_keeping.sql');
      await client2.end().catch(() => {});
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main();
