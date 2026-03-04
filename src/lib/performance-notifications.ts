import { SupabaseClient } from '@supabase/supabase-js';
import { createNotification, createBulkNotifications, sendEmailNotification } from './notification-service';
import type { PKTrackerType } from './types';

/**
 * Post-sync notification checks.
 * Call after syncAll() completes to notify admins/AMs of issues.
 */
export async function checkAndNotify(supabase: SupabaseClient) {
  const adminIds = await getAdminUserIds(supabase);
  if (adminIds.length === 0) return;

  await Promise.all([
    notifyNewFlaggedTickets(supabase, adminIds),
    notifyOverdueTrackers(supabase, adminIds),
    notifySyncErrors(supabase, adminIds),
  ]);
}

/**
 * Get all admin user IDs (for sending notifications).
 */
async function getAdminUserIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin');
  return (data || []).map(p => p.id);
}

/**
 * Notify admins about new flagged tickets found during sync.
 * Only sends if there are recent flags (synced in last hour).
 */
async function notifyNewFlaggedTickets(supabase: SupabaseClient, adminIds: string[]) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('pk_flagged_tickets')
    .select('*', { count: 'exact', head: true })
    .gte('synced_at', oneHourAgo);

  if (!count || count === 0) return;

  await createBulkNotifications(supabase, adminIds, {
    type: 'pk_red_flag',
    title: `${count} flagged ticket${count > 1 ? 's' : ''} found`,
    body: 'New flagged tickets were detected during the latest sync. Review them in the Performance Hub.',
    metadata: { count, source: 'performance_sync' },
  });
}

/**
 * Notify admins about trackers that haven't synced within their expected frequency.
 */
async function notifyOverdueTrackers(supabase: SupabaseClient, adminIds: string[]) {
  const { data: configs } = await supabase
    .from('pk_sync_configs')
    .select('tracker_type, sync_frequency, last_synced_at')
    .eq('is_active', true)
    .neq('tracker_type', 'masterlist');

  if (!configs) return;

  const now = Date.now();
  const overdueTrackers: string[] = [];

  for (const config of configs) {
    if (!config.last_synced_at) {
      overdueTrackers.push(config.tracker_type);
      continue;
    }

    const hoursSince = (now - new Date(config.last_synced_at).getTime()) / (1000 * 60 * 60);
    const thresholds: Record<string, number> = {
      daily: 48,
      weekly: 336,    // 2 weeks
      monthly: 1440,  // 60 days
    };
    const threshold = thresholds[config.sync_frequency] || 48;
    if (hoursSince > threshold) {
      overdueTrackers.push(config.tracker_type);
    }
  }

  if (overdueTrackers.length === 0) return;

  await createBulkNotifications(supabase, adminIds, {
    type: 'pk_overdue',
    title: `${overdueTrackers.length} tracker${overdueTrackers.length > 1 ? 's' : ''} overdue`,
    body: `The following trackers are past their expected sync window: ${overdueTrackers.join(', ')}`,
    metadata: { trackers: overdueTrackers, source: 'performance_sync' },
  });
}

/**
 * Notify admins about sync errors from the most recent run.
 */
async function notifySyncErrors(supabase: SupabaseClient, adminIds: string[]) {
  const { data: lastRun } = await supabase
    .from('pk_sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastRun || lastRun.status !== 'error') return;

  const errorCount = Array.isArray(lastRun.errors) ? lastRun.errors.length : 0;
  if (errorCount === 0) return;

  await createBulkNotifications(supabase, adminIds, {
    type: 'pk_sync_error',
    title: `Sync completed with ${errorCount} error${errorCount > 1 ? 's' : ''}`,
    body: 'The latest Performance Keeping sync encountered errors. Check the sync status in the Performance Hub.',
    metadata: { run_id: lastRun.id, error_count: errorCount, source: 'performance_sync' },
  });
}

/**
 * Send a reminder notification to a specific AM about a pending task.
 * Can be called from a cron or manual trigger.
 */
export async function sendAMReminder(
  supabase: SupabaseClient,
  amProfileId: string,
  trackerType: PKTrackerType,
  message: string,
) {
  await createNotification(supabase, {
    userId: amProfileId,
    type: 'pk_reminder',
    title: `Performance reminder: ${trackerType.replace(/_/g, ' ')}`,
    body: message,
    metadata: { tracker_type: trackerType, source: 'performance_reminder' },
  });
}

// ─── AM "Not Yet" Reminder System ────────────────────────────────

interface PendingItem {
  client_name: string | null;
  meeting_date?: string | null;
  date_sent?: string | null;
}

interface AMPendingTasks {
  amName: string;
  profileId: string | null;
  fathomNotWatched: PendingItem[];
  fathomNoActionItems: PendingItem[];
  clientUpdatesNotOnTime: PendingItem[];
}

/**
 * Resolve AM display names to profile IDs.
 * Matches case-insensitively against profiles.display_name.
 */
async function resolveAMProfiles(
  supabase: SupabaseClient,
  amNames: string[]
): Promise<Map<string, string>> {
  if (amNames.length === 0) return new Map();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name');

  const nameToId = new Map<string, string>();
  if (!profiles) return nameToId;

  for (const name of amNames) {
    const match = profiles.find(
      (p: { id: string; display_name: string }) =>
        p.display_name.toLowerCase() === name.toLowerCase()
    );
    if (match) nameToId.set(name, match.id);
  }

  return nameToId;
}

/**
 * Check if a pk_reminder notification was already sent to this AM
 * within the given cooldown window (default 24 hours).
 */
async function wasRecentlyReminded(
  supabase: SupabaseClient,
  profileId: string,
  cooldownHours = 24
): Promise<boolean> {
  const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profileId)
    .eq('type', 'pk_reminder')
    .gte('created_at', since);

  return (count || 0) > 0;
}

/**
 * Scan pk_fathom_videos and pk_client_updates for incomplete ("Not Yet") items
 * from the last 30 days, group by AM, and send consolidated reminders.
 *
 * Dedup: skips AMs who received a pk_reminder within the last 24 hours.
 * Returns a summary of what was sent.
 */
export async function notifyAMsPendingTasks(
  supabase: SupabaseClient,
  options: { lookbackDays?: number; cooldownHours?: number } = {}
): Promise<{ reminded: string[]; skipped: string[]; noProfile: string[]; debug?: Record<string, unknown> }> {
  const lookbackDays = options.lookbackDays ?? 30;
  const cooldownHours = options.cooldownHours ?? 24;
  const cutoffDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // 1. Query Fathom videos where watched = false or NULL (recent items only)
  const { data: fathomRows } = await supabase
    .from('pk_fathom_videos')
    .select('account_manager_name, client_name, meeting_date, watched, action_items_sent')
    .or('watched.is.null,watched.eq.false')
    .gte('meeting_date', cutoffDate);

  // 2. Also get Fathom videos where action_items_sent = false or NULL
  const { data: fathomActionRows } = await supabase
    .from('pk_fathom_videos')
    .select('account_manager_name, client_name, meeting_date, action_items_sent')
    .or('action_items_sent.is.null,action_items_sent.eq.false')
    .gte('meeting_date', cutoffDate);

  // 3. Query Client Updates where on_time = false or NULL
  const { data: updateRows } = await supabase
    .from('pk_client_updates')
    .select('account_manager_name, client_name, date_sent, on_time')
    .or('on_time.is.null,on_time.eq.false')
    .gte('date_sent', cutoffDate);

  // 4. Aggregate by AM
  const amMap = new Map<string, AMPendingTasks>();

  const getOrCreate = (name: string): AMPendingTasks => {
    if (!amMap.has(name)) {
      amMap.set(name, {
        amName: name,
        profileId: null,
        fathomNotWatched: [],
        fathomNoActionItems: [],
        clientUpdatesNotOnTime: [],
      });
    }
    return amMap.get(name)!;
  };

  for (const row of fathomRows || []) {
    const am = getOrCreate(row.account_manager_name);
    am.fathomNotWatched.push({
      client_name: row.client_name,
      meeting_date: row.meeting_date,
    });
  }

  for (const row of fathomActionRows || []) {
    const am = getOrCreate(row.account_manager_name);
    // Avoid duplicates if already in fathomNotWatched with same client+date
    const isDupe = am.fathomNoActionItems.some(
      (e) => e.client_name === row.client_name && e.meeting_date === row.meeting_date
    );
    if (!isDupe) {
      am.fathomNoActionItems.push({
        client_name: row.client_name,
        meeting_date: row.meeting_date,
      });
    }
  }

  for (const row of updateRows || []) {
    const am = getOrCreate(row.account_manager_name);
    am.clientUpdatesNotOnTime.push({
      client_name: row.client_name,
      date_sent: row.date_sent,
    });
  }

  // 5. Resolve AM names to profile IDs
  const amNames = Array.from(amMap.keys());
  const nameToProfile = await resolveAMProfiles(supabase, amNames);

  // Debug: fetch all profile display names for comparison
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('display_name');
  const profileNames = (allProfiles || []).map((p: { display_name: string }) => p.display_name);

  for (const [name, tasks] of Array.from(amMap)) {
    tasks.profileId = nameToProfile.get(name) || null;
  }

  // 6. Send reminders
  const reminded: string[] = [];
  const skipped: string[] = [];
  const noProfile: string[] = [];

  for (const [, tasks] of Array.from(amMap)) {
    const totalPending =
      tasks.fathomNotWatched.length +
      tasks.fathomNoActionItems.length +
      tasks.clientUpdatesNotOnTime.length;

    if (totalPending === 0) continue;

    if (!tasks.profileId) {
      noProfile.push(tasks.amName);
      continue;
    }

    // Check cooldown
    if (await wasRecentlyReminded(supabase, tasks.profileId, cooldownHours)) {
      skipped.push(tasks.amName);
      continue;
    }

    // Build consolidated message
    const lines: string[] = [];

    if (tasks.fathomNotWatched.length > 0) {
      lines.push(
        `Fathom Videos - Not Watched (${tasks.fathomNotWatched.length}): ` +
          tasks.fathomNotWatched
            .slice(0, 5)
            .map((i: PendingItem) => i.client_name || 'Unknown client')
            .join(', ') +
          (tasks.fathomNotWatched.length > 5
            ? ` +${tasks.fathomNotWatched.length - 5} more`
            : '')
      );
    }

    if (tasks.fathomNoActionItems.length > 0) {
      lines.push(
        `Fathom Videos - Action Items Not Sent (${tasks.fathomNoActionItems.length}): ` +
          tasks.fathomNoActionItems
            .slice(0, 5)
            .map((i: PendingItem) => i.client_name || 'Unknown client')
            .join(', ') +
          (tasks.fathomNoActionItems.length > 5
            ? ` +${tasks.fathomNoActionItems.length - 5} more`
            : '')
      );
    }

    if (tasks.clientUpdatesNotOnTime.length > 0) {
      lines.push(
        `Client Updates - Not Sent On Time (${tasks.clientUpdatesNotOnTime.length}): ` +
          tasks.clientUpdatesNotOnTime
            .slice(0, 5)
            .map((i: PendingItem) => i.client_name || 'Unknown client')
            .join(', ') +
          (tasks.clientUpdatesNotOnTime.length > 5
            ? ` +${tasks.clientUpdatesNotOnTime.length - 5} more`
            : '')
      );
    }

    const body = lines.join('\n');
    const title = `You have ${totalPending} pending task${totalPending > 1 ? 's' : ''} to complete`;

    // In-app notification
    await createNotification(supabase, {
      userId: tasks.profileId,
      type: 'pk_reminder',
      title,
      body,
      metadata: {
        source: 'am_reminder_cron',
        fathom_not_watched: tasks.fathomNotWatched.length,
        fathom_no_action_items: tasks.fathomNoActionItems.length,
        client_updates_not_on_time: tasks.clientUpdatesNotOnTime.length,
      },
    });

    // Email notification
    await sendEmailNotification(
      supabase,
      tasks.profileId,
      title,
      body.replace(/\n/g, '<br/>')
    );

    reminded.push(tasks.amName);
  }

  return {
    reminded,
    skipped,
    noProfile,
    debug: {
      amNamesFromDB: amNames,
      profileDisplayNames: profileNames,
      matched: Array.from(nameToProfile.entries()).map(([k, v]) => ({ am: k, profileId: v })),
    },
  };
}
