import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { PKTrackerType, PK_TRACKER_LABELS, PK_TRACKER_FREQUENCIES, PKTrackerSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/performance/dashboard
 * Returns aggregated Performance Keeping dashboard data:
 * - Tracker summaries with freshness indicators
 * - AM scorecard (completion rates)
 * - Flagged ticket count
 * - Last sync run info
 */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get sync configs for freshness info
  const { data: configs } = await supabase
    .from('pk_sync_configs')
    .select('*')
    .eq('is_active', true);

  // Build tracker summaries
  const trackers: PKTrackerSummary[] = (configs || [])
    .filter((c: any) => c.tracker_type !== 'masterlist')
    .map((config: any) => {
      const trackerType = config.tracker_type as PKTrackerType;
      const lastSynced = config.last_synced_at ? new Date(config.last_synced_at) : null;
      const now = new Date();

      // Determine freshness based on sync frequency
      let freshness: 'fresh' | 'stale' | 'overdue' = 'overdue';
      if (lastSynced) {
        const hoursSince = (now.getTime() - lastSynced.getTime()) / (1000 * 60 * 60);
        const freq = config.sync_frequency;

        if (freq === 'daily' && hoursSince < 28) freshness = 'fresh';
        else if (freq === 'daily' && hoursSince < 48) freshness = 'stale';
        else if (freq === 'weekly' && hoursSince < 168) freshness = 'fresh';
        else if (freq === 'weekly' && hoursSince < 336) freshness = 'stale';
        else if (freq === 'monthly' && hoursSince < 744) freshness = 'fresh';
        else if (freq === 'monthly' && hoursSince < 1440) freshness = 'stale';
        else if (hoursSince < 24) freshness = 'fresh'; // fallback
      }

      return {
        tracker_type: trackerType,
        label: PK_TRACKER_LABELS[trackerType] || config.sheet_title,
        frequency: PK_TRACKER_FREQUENCIES[trackerType] || config.sync_frequency,
        total_rows: config.row_count || 0,
        last_synced_at: config.last_synced_at,
        sync_status: config.last_sync_status,
        freshness,
      };
    });

  // Get last sync run
  const { data: lastRun } = await supabase
    .from('pk_sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  // AM scorecard: aggregate completion rates
  const amScorecard = await buildAMScorecard(supabase);

  // Flagged tickets count
  const { count: flaggedCount } = await supabase
    .from('pk_flagged_tickets')
    .select('*', { count: 'exact', head: true });

  return NextResponse.json({
    trackers,
    last_sync_run: lastRun,
    am_scorecard: amScorecard,
    flagged_tickets_count: flaggedCount || 0,
  });
}

async function buildAMScorecard(supabase: SupabaseClient) {
  const { data: fathomData } = await supabase
    .from('pk_fathom_videos')
    .select('account_manager_name, watched');

  const { data: updatesData } = await supabase
    .from('pk_client_updates')
    .select('account_manager_name, on_time');

  const { data: sanityData } = await supabase
    .from('pk_sanity_checks')
    .select('account_manager_name, sanity_check_done');

  // Aggregate by AM
  const amMap = new Map<string, {
    fathom_watched: number; fathom_total: number;
    updates_on_time: number; updates_total: number;
    sanity_done: number; sanity_total: number;
  }>();

  const getOrCreate = (name: string) => {
    if (!amMap.has(name)) {
      amMap.set(name, {
        fathom_watched: 0, fathom_total: 0,
        updates_on_time: 0, updates_total: 0,
        sanity_done: 0, sanity_total: 0,
      });
    }
    return amMap.get(name)!;
  };

  for (const row of fathomData || []) {
    const am = getOrCreate(row.account_manager_name);
    am.fathom_total++;
    if (row.watched) am.fathom_watched++;
  }

  for (const row of updatesData || []) {
    const am = getOrCreate(row.account_manager_name);
    am.updates_total++;
    if (row.on_time) am.updates_on_time++;
  }

  for (const row of sanityData || []) {
    const am = getOrCreate(row.account_manager_name);
    am.sanity_total++;
    if (row.sanity_check_done) am.sanity_done++;
  }

  return Array.from(amMap.entries()).map(([name, data]) => ({
    account_manager_name: name,
    fathom_videos_watched: data.fathom_watched,
    fathom_videos_total: data.fathom_total,
    client_updates_on_time: data.updates_on_time,
    client_updates_total: data.updates_total,
    sanity_checks_done: data.sanity_done,
    sanity_checks_total: data.sanity_total,
  }));
}
