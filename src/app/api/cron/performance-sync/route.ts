import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncAll } from '@/lib/performance-sync';
import { checkAndNotify } from '@/lib/performance-notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min max for full sync

/**
 * GET /api/cron/performance-sync
 * Scheduled cron job that syncs all Performance Keeping Google Sheets
 * into the pk_* database tables.
 *
 * Protected by CRON_SECRET bearer token.
 *
 * Query params:
 *   ?tracker=fathom_videos,client_updates  -- sync specific trackers only
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
  const trackerParam = searchParams.get('tracker');
  const trackerFilter = trackerParam ? trackerParam.split(',') as any[] : undefined;

  try {
    const run = await syncAll(supabase, 'cron', trackerFilter);

    // Post-sync notifications (non-blocking)
    checkAndNotify(supabase).catch(err =>
      console.error('[PK Cron] Notification check failed:', err)
    );

    return NextResponse.json({
      message: 'Performance Keeping sync complete',
      run_id: run.id,
      status: run.status,
      sheets_synced: run.sheets_synced,
      rows_synced: run.rows_synced,
      errors: run.errors,
      duration_ms: run.duration_ms,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
