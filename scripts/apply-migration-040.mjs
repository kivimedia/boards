/**
 * Apply migration 040 — Trello Alignment columns
 * Run: node scripts/apply-migration-040.mjs
 *
 * Uses Supabase Management API with the database's direct connection.
 * Falls back to using fetch against the PostgREST API to verify.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

async function checkColumn(table, column) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${column}&limit=1`, { headers });
  if (res.ok) return true;
  const body = await res.json();
  return body.code !== '42703'; // 42703 = column does not exist
}

async function runViaPgMeta(sql) {
  // Supabase exposes pg-meta API at /pg/query for service role
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: sql }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function main() {
  console.log('=== Migration 040: Trello Alignment ===\n');

  // Check current state
  const checks = [
    { table: 'cards', column: 'cover_image_url' },
    { table: 'cards', column: 'size' },
    { table: 'cards', column: 'start_date' },
    { table: 'comments', column: 'parent_comment_id' },
  ];

  for (const { table, column } of checks) {
    const exists = await checkColumn(table, column);
    console.log(`  ${table}.${column}: ${exists ? 'EXISTS' : 'MISSING'}`);
  }

  // Try to apply via pg-meta
  const statements = [
    "ALTER TABLE cards ADD COLUMN IF NOT EXISTS cover_image_url text",
    "ALTER TABLE cards ADD COLUMN IF NOT EXISTS size text DEFAULT 'medium'",
    "CREATE INDEX IF NOT EXISTS idx_cards_start_date ON cards (start_date) WHERE start_date IS NOT NULL",
    "ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE",
    "CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_comment_id) WHERE parent_comment_id IS NOT NULL",
  ];

  console.log('\nAttempting to apply via pg-meta API...');
  for (const sql of statements) {
    const label = sql.substring(0, 60) + '...';
    const result = await runViaPgMeta(sql);
    if (result.ok) {
      console.log(`  OK: ${label}`);
    } else {
      console.log(`  FAILED (${result.status}): ${label}`);
      console.log(`    ${result.body.substring(0, 200)}`);
    }
  }

  // Re-check
  console.log('\n--- Post-migration check ---');
  for (const { table, column } of checks) {
    const exists = await checkColumn(table, column);
    console.log(`  ${table}.${column}: ${exists ? 'EXISTS' : 'MISSING'}`);
  }
}

main().catch(console.error);
