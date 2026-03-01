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
 * Send email notification via Resend.
 * Checks user preferences before sending.
 */
export async function sendEmailNotification(
  supabase: SupabaseClient,
  userId: string,
  subject: string,
  body: string,
  cardId?: string
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

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log(`[NotificationService] RESEND_API_KEY not configured, skipping email to ${userId}`);
    return;
  }

  // Get user email from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single();

  if (!profile?.email) return;

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'KM Boards <noreply@dailycookie.co>';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kmboards.co';
  const cardLink = cardId ? `${siteUrl}/card/${cardId}` : siteUrl;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [profile.email],
        subject: `${subject} - Kivi Media`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px 0;">
            <div style="background: #1a1f36; border-radius: 12px; padding: 16px 20px; margin-bottom: 20px;">
              <h1 style="color: #fff; font-size: 16px; margin: 0;">Kivi Media</h1>
            </div>
            <p style="color: #333; font-size: 14px; line-height: 1.6; font-weight: 600;">${subject}</p>
            ${body ? `<p style="color: #555; font-size: 13px; line-height: 1.5;">${body.slice(0, 300)}${body.length > 300 ? '...' : ''}</p>` : ''}
            <div style="text-align: center; margin: 24px 0;">
              <a href="${cardLink}" style="display: inline-block; background: #4F6BFF; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 13px;">View in Kivi Media</a>
            </div>
            <p style="color: #999; font-size: 11px;">You're receiving this because of your notification preferences.</p>
          </div>
        `,
      }),
    });
  } catch (err) {
    console.error('[NotificationService] Email send failed:', err);
  }
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
