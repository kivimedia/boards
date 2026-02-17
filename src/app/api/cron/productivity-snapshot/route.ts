import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeNightlySnapshots } from '@/lib/productivity-analytics';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 min max for nightly computation

/**
 * GET /api/cron/productivity-snapshot
 * Nightly cron job (2:00 AM UTC) that computes productivity snapshots
 * for all active boards and generates anomaly alerts.
 *
 * Protected by CRON_SECRET bearer token.
 */
export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Use yesterday's date for the snapshot (cron runs at 2 AM, capturing previous day)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const snapshotDate = yesterday.toISOString().split('T')[0];

  // Skip weekends (Saturday = 6, Sunday = 0)
  const dayOfWeek = yesterday.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return NextResponse.json({
      message: 'Skipped weekend',
      date: snapshotDate,
      snapshotsCreated: 0,
      alertsGenerated: 0,
    });
  }

  try {
    const result = await computeNightlySnapshots(supabase, snapshotDate);

    return NextResponse.json({
      message: 'Productivity snapshot cron complete',
      date: snapshotDate,
      ...result,
    });
  } catch (err) {
    console.error('[ProductivityCron] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Snapshot computation failed' },
      { status: 500 }
    );
  }
}
