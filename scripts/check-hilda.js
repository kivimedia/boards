const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Find Hilda's profile
  const { data: profiles } = await sb.from('profiles')
    .select('id, display_name, email, role')
    .ilike('display_name', '%hilda%');

  if (!profiles || profiles.length === 0) {
    // Try email
    const { data: p2 } = await sb.from('profiles')
      .select('id, display_name, email, role')
      .ilike('email', '%hilda%');
    if (!p2 || p2.length === 0) {
      console.log('No profile found for Hilda');
      return;
    }
    profiles.push(...p2);
  }

  for (const p of profiles) {
    console.log(`Profile: ${p.display_name} (${p.email})`);
    console.log(`  ID: ${p.id}`);
    console.log(`  Role: ${p.role}`);

    // Check board memberships
    const { data: memberships } = await sb.from('board_members')
      .select('board_id, role, boards(title)')
      .eq('user_id', p.id);

    console.log(`\n  Board memberships (${(memberships || []).length}):`);
    for (const m of memberships || []) {
      console.log(`    - ${m.boards?.title || m.board_id} (role: ${m.role})`);
    }

    // Check RLS - can she insert cards?
    // The cards table RLS policy typically checks auth.uid() = created_by
    // card_placements RLS might check board membership
    console.log('\n  Checking RLS policies...');

    // Check if there's an approved signup
    const { data: signup } = await sb.from('signup_approvals')
      .select('*')
      .eq('user_id', p.id)
      .limit(1);

    if (signup && signup.length > 0) {
      console.log(`  Signup approval: ${JSON.stringify(signup[0])}`);
    } else {
      console.log('  No signup_approvals record found');
    }
  }

  // Also check RLS policies on cards and card_placements
  console.log('\n=== RLS POLICIES ===');
  const { data: policies } = await sb.rpc('get_policies', undefined).catch(() => ({ data: null }));

  // Alternative: check via SQL
  // Let's check if card_placements has restrictive policies
  const { data: testInsert, error: testErr } = await sb.from('cards')
    .select('id')
    .limit(1);
  console.log(`Cards table accessible: ${testErr ? 'NO - ' + testErr.message : 'YES'}`);
})();
