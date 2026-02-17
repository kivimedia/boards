import pg from 'pg';
import { readFileSync } from 'fs';

// Supabase connection - the service role key JWT contains the database password
// Standard Supabase pooler connection format
const projectRef = 'uqoogrnrzfsurupqkgco';
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!dbPassword) {
  console.log('SUPABASE_DB_PASSWORD not set in .env.local');
  console.log('You can find it in Supabase Dashboard > Settings > Database > Connection string');
  console.log('');
  console.log('Alternatively, trying with the transaction pooler...');
}

// Try multiple connection approaches
const connectionStrings = [
  // Direct connection (port 5432)
  `postgresql://postgres.${projectRef}:${dbPassword || 'PASSWORD'}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
  // Session pooler (port 5432)
  `postgresql://postgres.${projectRef}:${dbPassword || 'PASSWORD'}@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`,
  // Transaction pooler (port 6543)
  `postgresql://postgres:${dbPassword || 'PASSWORD'}@db.${projectRef}.supabase.co:5432/postgres`,
];

const migrations = [
  'supabase/migrations/044_candidate_location.sql',
  'supabase/migrations/045_scout_pipeline.sql',
  'supabase/migrations/048_productivity_alerts.sql',
  'supabase/migrations/049_web_research_and_agent_tools.sql',
  'supabase/migrations/049_whatsapp_business_api.sql',
  'supabase/migrations/050_video_design_review.sql',
  'supabase/migrations/051_qa_monitoring.sql',
];

async function tryConnect(connStr, label) {
  const client = new pg.Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  try {
    await client.connect();
    console.log(`Connected via ${label}`);
    return client;
  } catch (e) {
    console.log(`  ${label} failed: ${e.message.substring(0, 100)}`);
    return null;
  }
}

async function main() {
  let client = null;

  if (dbPassword) {
    for (let i = 0; i < connectionStrings.length; i++) {
      client = await tryConnect(connectionStrings[i], `method ${i + 1}`);
      if (client) break;
    }
  }

  if (!client) {
    console.log('\nCould not connect to database.');
    console.log('Please add SUPABASE_DB_PASSWORD to .env.local');
    console.log('Find it at: https://supabase.com/dashboard/project/uqoogrnrzfsurupqkgco/settings/database');
    process.exit(1);
  }

  // Run each migration
  for (const file of migrations) {
    const sql = readFileSync(file, 'utf8');
    console.log(`\n=== ${file} ===`);
    try {
      await client.query(sql);
      console.log('  OK');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('  SKIP (already exists)');
      } else if (e.message.includes('does not exist')) {
        console.log(`  WARN: ${e.message}`);
      } else {
        console.log(`  ERROR: ${e.message}`);
      }
    }
  }

  await client.end();
  console.log('\nDone!');
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
