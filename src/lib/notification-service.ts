import { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationType } from './types';
import { getSubscriptions, sendPush, buildPushPayload } from './push-notifications';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  cardId?: string;
  boardId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create an in-app notification for a user.
 */
export async function createNotification(
  supabase: SupabaseClient,
  payload: NotificationPayload
): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: payload.userId,
    type: payload.type,
    title: payload.title,
    body: payload.body || null,
    card_id: payload.cardId || null,
    board_id: payload.boardId || null,
    metadata: payload.metadata || {},
  });

  if (error) {
    console.error('[NotificationService] Failed to create notification:', error.message);
  }

  // Fire push notification (non-blocking)
  sendPushForNotification(supabase, payload.userId, payload.title, payload.body || '', payload.cardId ? `/cards/${payload.cardId}` : undefined).catch(() => {});
}

/**
 * Create notifications for multiple users at once.
 */
export async function createBulkNotifications(
  supabase: SupabaseClient,
  userIds: string[],
  payload: Omit<NotificationPayload, 'userId'>
): Promise<void> {
  if (userIds.length === 0) return;

  const rows = userIds.map((userId) => ({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    body: payload.body || null,
    card_id: payload.cardId || null,
    board_id: payload.boardId || null,
    metadata: payload.metadata || {},
  }));

  const { error } = await supabase.from('notifications').insert(rows);

  if (error) {
    console.error('[NotificationService] Failed to create bulk notifications:', error.message);
  }
}

/**
 * Mark a notification as read.
 */
export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string
): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllNotificationsRead(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  return count || 0;
}

/**
 * Send email notification (placeholder for Resend.io integration in Phase 2).
 * Checks user preferences before sending.
 */
export async function sendEmailNotification(
  supabase: SupabaseClient,
  userId: string,
  subject: string,
  body: string
): Promise<void> {
  // Check user notification preferences
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('email_enabled')
    .eq('user_id', userId)
    .single();

  if (prefs && !prefs.email_enabled) {
    return; // User has email notifications disabled
  }

  // Placeholder: In Phase 2, this will use Resend.io
  console.log(
    `[NotificationService] Email notification (placeholder): to=${userId}, subject="${subject}"`
  );
}

/**
 * Notify all assignees of a card about an event.
 */
export async function notifyCardAssignees(
  supabase: SupabaseClient,
  cardId: string,
  payload: Omit<NotificationPayload, 'userId'>,
  excludeUserId?: string
): Promise<void> {
  const { data: assignees } = await supabase
    .from('card_assignees')
    .select('user_id')
    .eq('card_id', cardId);

  if (!assignees || assignees.length === 0) return;

  const userIds = assignees
    .map((a: { user_id: string }) => a.user_id)
    .filter((id: string) => id !== excludeUserId);

  await createBulkNotifications(supabase, userIds, payload);
}

/**
 * Notify all members of a board about an event.
 */
export async function notifyBoardMembers(
  supabase: SupabaseClient,
  boardId: string,
  payload: Omit<NotificationPayload, 'userId'>,
  excludeUserId?: string
): Promise<void> {
  const { data: members } = await supabase
    .from('board_members')
    .select('user_id')
    .eq('board_id', boardId);

  if (!members || members.length === 0) return;

  const userIds = members
    .map((m: { user_id: string }) => m.user_id)
    .filter((id: string) => id !== excludeUserId);

  await createBulkNotifications(supabase, userIds, payload);
}

/**
 * Send push notification for a newly created notification.
 * Checks user preferences and quiet hours before sending.
 */
export async function sendPushForNotification(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  // Check preferences
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('push_enabled, quiet_hours_start, quiet_hours_end')
    .eq('user_id', userId)
    .single();

  if (prefs && !prefs.push_enabled) return;

  // Check quiet hours
  if (prefs?.quiet_hours_start && prefs?.quiet_hours_end) {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    if (currentTime >= prefs.quiet_hours_start && currentTime <= prefs.quiet_hours_end) {
      return; // Within quiet hours
    }
  }

  const subscriptions = await getSubscriptions(supabase, userId);
  if (subscriptions.length === 0) return;

  const payload = buildPushPayload(title, body, url);
  await sendPush(supabase, subscriptions, payload);
}
