import pg from 'pg';
import { readFileSync } from 'fs';

// Read env
const env = readFileSync('C:/Users/raviv/agency-board/.env.local', 'utf8');
const getEnv = (key) => {
  const match = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].trim() : null;
};

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

// Decode the JWT to get the project ref
const ref = SUPABASE_URL.replace('https://', '').split('.')[0];
console.log('Project ref:', ref);

// Try connecting via the transaction pooler (port 5432) or session pooler (port 6543)
// For DDL, we need session mode (port 5432 direct or 6543 session)
// Supabase direct connection: db.<ref>.supabase.co:5432
// But we need the DB password...

// Alternative approach: use supabase-js with the service role to create a temp function
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// First, check what we're working with
console.log('\n--- Pre-migration column check ---');
const checks = [
  ['cards', 'cover_image_url'],
  ['cards', 'size'],
  ['cards', 'start_date'],
  ['comments', 'parent_comment_id'],
];

for (const [table, col] of checks) {
  const { error } = await supabase.from(table).select(col).limit(1);
  console.log(`  ${table}.${col}: ${error ? 'MISSING' : 'EXISTS'}`);
}

// Since we can't run DDL directly via REST API, try creating a migration function
// by exploiting the fact that service_role can call the internal pg functions
console.log('\n--- Attempting migration via SQL function creation ---');

// Try to create an exec_sql function using the REST endpoint
// This won't work via PostgREST... but let's try the edge function approach
// Actually, the simplest is to use the dev server itself - create a temp API route

console.log('\nDDL requires direct database access.');
console.log('Starting dev server approach - will create a temp API route...');

// Write a temporary API route
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';

const routeDir = 'C:/Users/raviv/agency-board/src/app/api/admin/run-migration-040';
if (!existsSync(routeDir)) {
  mkdirSync(routeDir, { recursive: true });
}

writeFileSync(routeDir + '/route.ts', `
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Use service role to create a temp function that can run DDL
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'public' } }
  );

  const results: string[] = [];

  // We'll use the Supabase client to insert/update to verify columns
  // But for DDL we need the postgres connection
  // Using pg package directly with the Supabase connection pooler

  try {
    // Try to import pg and connect
    const { default: pg } = await import('pg');

    // Supabase database password is stored in the project settings
    // For now, try using supabase-js admin capabilities

    // Actually, the trick is to use the Supabase Management API
    // which is at api.supabase.com
    // But that needs an access token...

    // Let's try a different approach: use the pg package with supavisor
    // The transaction mode pooler works for DDL too in newer Supabase

    results.push('Migration route created - but needs DB password for DDL');
    results.push('Please run the SQL in Supabase SQL Editor');

  } catch (err: any) {
    results.push('Error: ' + err.message);
  }

  return NextResponse.json({ results });
}
`);

console.log('Created temp route. Cleaning up...');
rmSync(routeDir, { recursive: true, force: true });

console.log('\n========================================');
console.log('MIGRATION 040 CANNOT BE APPLIED PROGRAMMATICALLY');
console.log('The Supabase REST API does not support DDL statements.');
console.log('');
console.log('Please run this SQL in Supabase SQL Editor:');
console.log('https://supabase.com/dashboard/project/' + ref + '/sql/new');
console.log('');
console.log('--- SQL TO RUN ---');
console.log(`
ALTER TABLE cards ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS size text CHECK (size IN ('small', 'medium', 'large')) DEFAULT 'medium';
CREATE INDEX IF NOT EXISTS idx_cards_start_date ON cards (start_date) WHERE start_date IS NOT NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL;
`);
console.log('========================================');
