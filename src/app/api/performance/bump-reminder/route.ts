import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { notifyAMsPendingTasks } from '@/lib/performance-notifications';

export const dynamic = 'force-dynamic';

/**
 * POST /api/performance/bump-reminder
 * Manually re-send AM reminders for pending tasks (bypasses 24h cooldown).
 * Admin or devi@dailycookie.co only.
 */
export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const isAllowedUser = user.email === 'devi@dailycookie.co';
  if (!isAdmin && !isAllowedUser) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const result = await notifyAMsPendingTasks(serviceClient, {
      cooldownHours: 0,
    });

    return NextResponse.json({
      message: 'Bump reminders sent',
      reminded: result.reminded,
      skipped: result.skipped,
      noProfile: result.noProfile,
      summary: {
        total_reminded: result.reminded.length,
        total_skipped: result.skipped.length,
        total_no_profile: result.noProfile.length,
      },
      debug: result.debug,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[bump-reminder] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
