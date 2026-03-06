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
  task_label: string;
  task_date?: string | null;
  notes?: string | null;
}

interface AMPendingTasks {
  amName: string;
  profileId: string | null;
  fathomNotWatched: PendingItem[];
  fathomNoActionItems: PendingItem[];
  clientUpdatesNotOnTime: PendingItem[];
  fathomMissingWatchMark: PendingItem[];
  fathomMissingActionMark: PendingItem[];
  clientUpdatesMissingOnTimeMark: PendingItem[];
  sanityTestsMissingMark: PendingItem[];
  picsMonitoringMissingMark: PendingItem[];
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
      (p: { id: string; display_name: string | null }) =>
        (p.display_name || '').toLowerCase() === name.toLowerCase()
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
 * Scan pk_am_daily_tasks and key tracker tables for pending/missing-mark AM
 * tasks, group by AM, and send consolidated reminders.
 *
 * Dedup: skips AMs who received a pk_reminder within the last 24 hours.
 * Returns a summary of what was sent.
 */
export async function notifyAMsPendingTasks(
  supabase: SupabaseClient,
  options: { lookbackDays?: number; cooldownHours?: number } = {}
): Promise<{ reminded: string[]; skipped: string[]; noProfile: string[] }> {
  const lookbackDays = options.lookbackDays ?? 30;
  const cooldownHours = options.cooldownHours ?? 24;
  const cutoffDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // 1. Query pending AM daily tasks
  const { data: taskRows } = await supabase
    .from('pk_am_daily_tasks')
    .select('account_manager_name, task_type, task_label, notes, task_date')
    .eq('is_completed', false)
    .gte('task_date', cutoffDate);

  // 2. Aggregate by AM
  const amMap = new Map<string, AMPendingTasks>();

  const getOrCreate = (name: string): AMPendingTasks => {
    if (!amMap.has(name)) {
      amMap.set(name, {
        amName: name,
        profileId: null,
        fathomNotWatched: [],
        fathomNoActionItems: [],
        clientUpdatesNotOnTime: [],
        fathomMissingWatchMark: [],
        fathomMissingActionMark: [],
        clientUpdatesMissingOnTimeMark: [],
        sanityTestsMissingMark: [],
        picsMonitoringMissingMark: [],
      });
    }
    return amMap.get(name)!;
  };

  for (const row of taskRows || []) {
    const amName = (row.account_manager_name || '').trim();
    const taskLabel = (row.task_label || '').trim();
    if (!amName || !taskLabel) continue;

    const am = getOrCreate(amName);
    const item: PendingItem = {
      task_label: taskLabel,
      task_date: row.task_date,
      notes: row.notes || null,
    };

    if (row.task_type === 'fathom_watch') {
      am.fathomNotWatched.push(item);
    } else if (row.task_type === 'action_items_send') {
      am.fathomNoActionItems.push(item);
    } else if (row.task_type === 'client_update') {
      am.clientUpdatesNotOnTime.push(item);
    }
  }

  // 2b. Add rows with missing Yes/No marks from key tracker tables.
  const [
    { data: fathomRows },
    { data: clientUpdateRows },
    { data: sanityTestRows },
    { data: picsRows },
  ] = await Promise.all([
    supabase
      .from('pk_fathom_videos')
      .select('account_manager_name, client_name, meeting_date, watched, action_items_sent')
      .gte('meeting_date', cutoffDate),
    supabase
      .from('pk_client_updates')
      .select('account_manager_name, client_name, date_sent, on_time')
      .gte('date_sent', cutoffDate),
    supabase
      .from('pk_sanity_tests')
      .select('account_manager_name, client_name, test_date, test_done, email_received')
      .gte('test_date', cutoffDate),
    supabase
      .from('pk_pics_monitoring')
      .select('account_manager_name, client_name, check_date, duration')
      .gte('check_date', cutoffDate),
  ]);

  for (const row of fathomRows || []) {
    const amName = String(row.account_manager_name || '').trim();
    if (!amName) continue;
    const clientName = String(row.client_name || 'Unknown client').trim();
    const am = getOrCreate(amName);

    if (row.watched === null || row.watched === undefined) {
      am.fathomMissingWatchMark.push({
        task_label: clientName,
        task_date: row.meeting_date || null,
        notes: 'Missing Yes/No mark in Watched',
      });
    }
    if (row.action_items_sent === null || row.action_items_sent === undefined) {
      am.fathomMissingActionMark.push({
        task_label: clientName,
        task_date: row.meeting_date || null,
        notes: 'Missing Yes/No mark in Action Items Sent',
      });
    }
  }

  for (const row of clientUpdateRows || []) {
    const amName = String(row.account_manager_name || '').trim();
    if (!amName) continue;
    if (row.on_time !== null && row.on_time !== undefined) continue;

    const clientName = String(row.client_name || 'Unknown client').trim();
    const am = getOrCreate(amName);
    am.clientUpdatesMissingOnTimeMark.push({
      task_label: clientName,
      task_date: row.date_sent || null,
      notes: 'Missing Yes/No mark in On Time',
    });
  }

  for (const row of sanityTestRows || []) {
    const amName = String(row.account_manager_name || '').trim();
    if (!amName) continue;

    const missingFields: string[] = [];
    if (row.test_done === null || row.test_done === undefined) missingFields.push('Test Done');
    if (row.email_received === null || row.email_received === undefined) missingFields.push('Email Received');
    if (missingFields.length === 0) continue;

    const clientName = String(row.client_name || 'Unknown client').trim();
    const am = getOrCreate(amName);
    am.sanityTestsMissingMark.push({
      task_label: clientName,
      task_date: row.test_date || null,
      notes: `Missing Yes/No mark in: ${missingFields.join(', ')}`,
    });
  }

  for (const row of picsRows || []) {
    const amName = String(row.account_manager_name || '').trim();
    if (!amName) continue;
    if (String(row.duration || '').trim()) continue;

    const clientName = String(row.client_name || 'Unknown client').trim();
    const am = getOrCreate(amName);
    am.picsMonitoringMissingMark.push({
      task_label: clientName,
      task_date: row.check_date || null,
      notes: 'Missing completion mark (Duration is blank)',
    });
  }

  // 3. Resolve AM names to profile IDs
  const amNames = Array.from(amMap.keys());
  const nameToProfile = await resolveAMProfiles(supabase, amNames);

  for (const [name, tasks] of Array.from(amMap)) {
    tasks.profileId = nameToProfile.get(name) || null;
  }

  // 4. Send reminders
  const reminded: string[] = [];
  const skipped: string[] = [];
  const noProfile: string[] = [];

  for (const [, tasks] of Array.from(amMap)) {
    const totalPending =
      tasks.fathomNotWatched.length +
      tasks.fathomNoActionItems.length +
      tasks.clientUpdatesNotOnTime.length +
      tasks.fathomMissingWatchMark.length +
      tasks.fathomMissingActionMark.length +
      tasks.clientUpdatesMissingOnTimeMark.length +
      tasks.sanityTestsMissingMark.length +
      tasks.picsMonitoringMissingMark.length;

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

    // Build consolidated message with dates for specificity
    const lines: string[] = [];
    const fmtDate = (d: string | null | undefined) => {
      if (!d) return '';
      try { return ` (${new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
      } catch { return ''; }
    };
    const fmtItem = (i: PendingItem) => {
      const date = fmtDate(i.task_date);
      const notes = i.notes ? ` - ${i.notes}` : '';
      return `${i.task_label}${date}${notes}`;
    };

    if (tasks.fathomNotWatched.length > 0) {
      lines.push(
        `Fathom Videos - Not Watched (${tasks.fathomNotWatched.length}):\n` +
          tasks.fathomNotWatched
            .map((i: PendingItem) => `- ${fmtItem(i)}`)
            .join('\n')
      );
    }

    if (tasks.fathomNoActionItems.length > 0) {
      lines.push(
        `Fathom Videos - Action Items Not Sent (${tasks.fathomNoActionItems.length}):\n` +
          tasks.fathomNoActionItems
            .map((i: PendingItem) => `- ${fmtItem(i)}`)
            .join('\n')
      );
    }

    if (tasks.clientUpdatesNotOnTime.length > 0) {
      lines.push(
        `Client Updates - Not Sent On Time (${tasks.clientUpdatesNotOnTime.length}):\n` +
          tasks.clientUpdatesNotOnTime
            .map((i: PendingItem) => `- ${fmtItem(i)}`)
            .join('\n')
      );
    }

    if (tasks.fathomMissingWatchMark.length > 0) {
      lines.push(
        `Fathom Videos - Missing Yes/No mark in Watched (${tasks.fathomMissingWatchMark.length}):\n` +
          tasks.fathomMissingWatchMark
            .map((i: PendingItem) => `- ${fmtItem(i)}`)
            .join('\n')
      );
    }

    if (tasks.fathomMissingActionMark.length > 0) {
      lines.push(
        `Fathom Videos - Missing Yes/No mark in Action Items Sent (${tasks.fathomMissingActionMark.length}):\n` +
          tasks.fathomMissingActionMark
            .map((i: PendingItem) => `- ${fmtItem(i)}`)
            .join('\n')
      );
    }

    if (tasks.clientUpdatesMissingOnTimeMark.length > 0) {
      lines.push(
        `Client Updates - Missing Yes/No mark in On Time (${tasks.clientUpdatesMissingOnTimeMark.length}):\n` +
          tasks.clientUpdatesMissingOnTimeMark
            .map((i: PendingItem) => `- ${fmtItem(i)}`)
            .join('\n')
      );
    }

    if (tasks.sanityTestsMissingMark.length > 0) {
      lines.push(
        `Sanity Tests - Missing Yes/No marks (${tasks.sanityTestsMissingMark.length}):\n` +
          tasks.sanityTestsMissingMark
            .map((i: PendingItem) => `- ${fmtItem(i)}`)
            .join('\n')
      );
    }

    if (tasks.picsMonitoringMissingMark.length > 0) {
      lines.push(
        `Pics.io Monitoring - Missing mark (${tasks.picsMonitoringMissingMark.length}):\n` +
          tasks.picsMonitoringMissingMark
            .map((i: PendingItem) => `- ${fmtItem(i)}`)
            .join('\n')
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
        source: 'am_daily_tasks',
        fathom_watch: tasks.fathomNotWatched.length,
        action_items_send: tasks.fathomNoActionItems.length,
        client_update: tasks.clientUpdatesNotOnTime.length,
        fathom_missing_watch_mark: tasks.fathomMissingWatchMark.length,
        fathom_missing_action_mark: tasks.fathomMissingActionMark.length,
        client_update_missing_mark: tasks.clientUpdatesMissingOnTimeMark.length,
        sanity_test_missing_mark: tasks.sanityTestsMissingMark.length,
        pics_missing_mark: tasks.picsMonitoringMissingMark.length,
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

  return { reminded, skipped, noProfile };
}
