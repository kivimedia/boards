import { SupabaseClient } from '@supabase/supabase-js';
import { createNotification, createBulkNotifications } from './notification-service';
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
