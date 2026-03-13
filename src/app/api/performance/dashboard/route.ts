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

  // Deduplicate configs by tracker_type (keep most recently synced, sum row counts)
  const configsByType = new Map<string, { config: any; totalRows: number }>();
  for (const c of (configs || []).filter((c: any) => c.tracker_type !== 'masterlist' && c.tracker_type !== 'sanity_tests')) {
    const existing = configsByType.get(c.tracker_type);
    if (!existing) {
      configsByType.set(c.tracker_type, { config: c, totalRows: c.row_count || 0 });
    } else {
      existing.totalRows += c.row_count || 0;
      // Keep the most recently synced config for freshness info
      if (c.last_synced_at && (!existing.config.last_synced_at || c.last_synced_at > existing.config.last_synced_at)) {
        existing.config = c;
      }
    }
  }

  // Build tracker summaries
  const trackers: PKTrackerSummary[] = Array.from(configsByType.values())
    .map(({ config, totalRows }) => {
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
        total_rows: totalRows,
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
  const [{ data: fathomData }, { data: updatesData }, { data: sanityData }] =
    await Promise.all([
      supabase
        .from('pk_fathom_videos')
        .select('account_manager_name, date_watched, watched'),
      supabase
        .from('pk_client_updates')
        .select('account_manager_name, on_time'),
      supabase
        .from('pk_sanity_checks')
        .select('account_manager_name, sanity_check_done'),
    ]);

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

  const normalizeAMName = (value: unknown): string => String(value || '').trim();
  const hasDateValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    return String(value).trim().length > 0;
  };
  const parseBoolean = (value: unknown): boolean | null => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
      return null;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) return null;
      if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
      if (['false', 'no', 'n', '0'].includes(normalized)) return false;
    }
    return null;
  };

  for (const row of fathomData || []) {
    const amName = normalizeAMName(row.account_manager_name);
    if (!amName) continue;
    const am = getOrCreate(amName);
    am.fathom_total++;
    const watched = hasDateValue(row.date_watched) || parseBoolean(row.watched) === true;
    if (watched) am.fathom_watched++;
  }

  for (const row of updatesData || []) {
    const amName = normalizeAMName(row.account_manager_name);
    if (!amName) continue;
    const am = getOrCreate(amName);
    am.updates_total++;
    if (parseBoolean(row.on_time) === true) am.updates_on_time++;
  }

  for (const row of sanityData || []) {
    const amName = normalizeAMName(row.account_manager_name);
    if (!amName) continue;
    const am = getOrCreate(amName);
    am.sanity_total++;
    if (parseBoolean(row.sanity_check_done) === true) am.sanity_done++;
  }

  return Array.from(amMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, data]) => ({
      account_manager_name: name,
      fathom_videos_watched: data.fathom_watched,
      fathom_videos_total: data.fathom_total,
      client_updates_on_time: data.updates_on_time,
      client_updates_total: data.updates_total,
      sanity_checks_done: data.sanity_done,
      sanity_checks_total: data.sanity_total,
    }));
}
