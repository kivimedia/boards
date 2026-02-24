const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // List ALL profiles to find Hilda
  const { data: profiles } = await sb.from('profiles')
    .select('id, display_name, email, role')
    .order('display_name');

  console.log('=== ALL PROFILES ===');
  for (const p of profiles || []) {
    console.log(`  ${(p.display_name || 'unnamed').padEnd(25)} | ${(p.email || '').padEnd(35)} | role: ${p.role || 'none'}`);
  }

  // Also check auth.users for any Hilda
  console.log('\n=== Searching auth users for "hilda" ===');
  const { data: { users }, error } = await sb.auth.admin.listUsers({ perPage: 100 });
  if (error) {
    console.log('Error listing users:', error.message);
  } else {
    const hildaUsers = (users || []).filter(u =>
      (u.email || '').toLowerCase().includes('hilda') ||
      (u.user_metadata?.display_name || '').toLowerCase().includes('hilda') ||
      (u.user_metadata?.full_name || '').toLowerCase().includes('hilda')
    );
    if (hildaUsers.length > 0) {
      for (const u of hildaUsers) {
        console.log(`  Auth user: ${u.email} | meta: ${JSON.stringify(u.user_metadata)} | id: ${u.id}`);
      }
    } else {
      console.log('  No auth user with "hilda" found');
      // Show all auth users
      console.log('\n=== ALL AUTH USERS ===');
      for (const u of users || []) {
        console.log(`  ${(u.email || 'no-email').padEnd(40)} | id: ${u.id}`);
      }
    }
  }
})();
