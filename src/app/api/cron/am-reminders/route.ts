import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyAMsPendingTasks } from '@/lib/performance-notifications';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/am-reminders
 *
 * Scans pk_fathom_videos and pk_client_updates for incomplete ("Not Yet") items,
 * groups them by Account Manager, and sends consolidated in-app + email reminders.
 *
 * Dedup: skips AMs who already received a pk_reminder in the last 24 hours.
 *
 * Query params:
 *   ?lookback=30   -- how many days back to scan (default: 30)
 *   ?cooldown=24   -- hours before re-sending to the same AM (default: 24)
 *
 * Protected by CRON_SECRET bearer token.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { searchParams } = new URL(request.url);
  const lookbackDays = parseInt(searchParams.get('lookback') || '30', 10);
  const cooldownHours = parseInt(searchParams.get('cooldown') || '24', 10);

  try {
    const result = await notifyAMsPendingTasks(supabase, {
      lookbackDays,
      cooldownHours,
    });

    return NextResponse.json({
      message: 'AM reminders processed',
      reminded: result.reminded,
      skipped_cooldown: result.skipped,
      no_profile_match: result.noProfile,
      summary: {
        total_reminded: result.reminded.length,
        total_skipped: result.skipped.length,
        total_no_profile: result.noProfile.length,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[am-reminders] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
