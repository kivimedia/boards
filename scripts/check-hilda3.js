const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const HILDA_ID = '8354ced0-3fb2-4131-a828-a6d2793de276';

(async () => {
  // Check if profile exists
  const { data: profile, error: profErr } = await sb.from('profiles')
    .select('*')
    .eq('id', HILDA_ID)
    .single();

  console.log('Profile:', profile ? JSON.stringify(profile, null, 2) : 'NOT FOUND');
  if (profErr) console.log('Profile error:', profErr.message);

  // Check board_members
  const { data: memberships } = await sb.from('board_members')
    .select('board_id, role, boards(title)')
    .eq('user_id', HILDA_ID);
  console.log(`\nBoard memberships: ${(memberships || []).length}`);
  for (const m of memberships || []) {
    console.log(`  - ${m.boards?.title || m.board_id} (role: ${m.role})`);
  }

  // Check signup_approvals
  const { data: signup } = await sb.from('signup_approvals')
    .select('*')
    .eq('user_id', HILDA_ID);
  console.log(`\nSignup approvals: ${JSON.stringify(signup)}`);

  // Check RLS policies on cards table
  const { data: rlsPolicies } = await sb.rpc('exec_sql', {
    query: `SELECT tablename, policyname, cmd, qual, with_check
            FROM pg_policies
            WHERE tablename IN ('cards', 'card_placements')
            ORDER BY tablename, policyname`
  }).catch(() => ({ data: null }));

  if (rlsPolicies) {
    console.log('\n=== RLS POLICIES ===');
    for (const p of rlsPolicies) {
      console.log(`  ${p.tablename}.${p.policyname} (${p.cmd})`);
      if (p.qual) console.log(`    USING: ${p.qual}`);
      if (p.with_check) console.log(`    WITH CHECK: ${p.with_check}`);
    }
  }

  // Check if there's a trigger that auto-creates profiles
  console.log('\n=== Checking profile creation triggers ===');
  const { data: triggers } = await sb.rpc('exec_sql', {
    query: `SELECT trigger_name, event_manipulation, action_statement
            FROM information_schema.triggers
            WHERE event_object_table = 'users'
            OR trigger_name ILIKE '%profile%'`
  }).catch(() => ({ data: null }));

  if (triggers) {
    for (const t of triggers) {
      console.log(`  ${t.trigger_name}: ${t.event_manipulation} -> ${t.action_statement}`);
    }
  } else {
    console.log('  Could not query triggers');
  }

  // Try creating her profile
  console.log('\n=== Creating missing profile for Hilda ===');
  const { data: newProfile, error: createErr } = await sb.from('profiles')
    .upsert({
      id: HILDA_ID,
      display_name: 'Hilda Yaneza',
      email: 'hilda@dailycookie.co',
      role: 'member',
    }, { onConflict: 'id' })
    .select()
    .single();

  if (createErr) {
    console.log('Create error:', createErr.message);
  } else {
    console.log('Created profile:', JSON.stringify(newProfile, null, 2));
  }

  // Check if she needs board memberships
  const { data: allBoards } = await sb.from('boards')
    .select('id, title')
    .eq('is_archived', false);

  const memberBoardIds = new Set((memberships || []).map(m => m.board_id));
  const missingBoards = (allBoards || []).filter(b => !memberBoardIds.has(b.id));

  if (missingBoards.length > 0) {
    console.log(`\nBoards she is NOT a member of:`);
    for (const b of missingBoards) {
      console.log(`  - ${b.title} (${b.id})`);
    }
  }
})();
