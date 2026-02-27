import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { syncAll } from '@/lib/performance-sync';
import { PKTrackerType } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/performance/sync
 * Manually trigger a Performance Keeping sync.
 * Admin only.
 *
 * Body: { trackers?: PKTrackerType[] }
 */
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role or allowed user (e.g. Devi)
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

  const body = await request.json().catch(() => ({}));
  const trackerFilter = body.trackers as PKTrackerType[] | undefined;

  // Use service client for sync operations
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const run = await syncAll(serviceClient, 'manual', trackerFilter);

    return NextResponse.json({
      message: 'Sync complete',
      run,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/performance/sync
 * Get sync status (last run, config status).
 */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get last sync run
  const { data: lastRun } = await supabase
    .from('pk_sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  // Get all sync configs with their status
  const { data: configs } = await supabase
    .from('pk_sync_configs')
    .select('*')
    .order('tracker_type');

  return NextResponse.json({
    last_run: lastRun,
    configs: configs || [],
  });
}
