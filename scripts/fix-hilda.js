const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const HILDA_ID = '8354ced0-3fb2-4131-a828-a6d2793de276';

(async () => {
  // Get all active boards
  const { data: boards } = await sb.from('boards')
    .select('id, title')
    .eq('is_archived', false)
    .order('title');

  console.log('Active boards:');
  for (const b of boards || []) {
    console.log(`  ${b.title} (${b.id})`);
  }

  // Check current memberships
  const { data: existing } = await sb.from('board_members')
    .select('board_id')
    .eq('user_id', HILDA_ID);
  const existingIds = new Set((existing || []).map(m => m.board_id));

  // Add her to all boards as 'member'
  const toAdd = (boards || []).filter(b => !existingIds.has(b.id));
  console.log(`\nAdding Hilda to ${toAdd.length} boards...`);

  for (const b of toAdd) {
    const { error } = await sb.from('board_members').insert({
      board_id: b.id,
      user_id: HILDA_ID,
      role: 'member',
    });
    if (error) {
      console.log(`  FAIL: ${b.title} - ${error.message}`);
    } else {
      console.log(`  OK: ${b.title}`);
    }
  }

  // Verify
  const { data: final } = await sb.from('board_members')
    .select('board_id, role, boards(title)')
    .eq('user_id', HILDA_ID);
  console.log(`\nFinal memberships: ${(final || []).length}`);
  for (const m of final || []) {
    console.log(`  - ${m.boards?.title} (${m.role})`);
  }
})();
