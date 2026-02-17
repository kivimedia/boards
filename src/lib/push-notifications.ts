import { SupabaseClient } from '@supabase/supabase-js';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

export async function subscribe(
  supabase: SupabaseClient,
  userId: string,
  subscription: { endpoint: string; p256dh: string; auth_key: string }
): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth_key: subscription.auth_key,
      },
      { onConflict: 'user_id,endpoint' }
    );

  if (error) {
    console.error('[PushNotifications] Failed to subscribe:', error.message);
  }
}

export async function unsubscribe(
  supabase: SupabaseClient,
  userId: string,
  endpoint: string
): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);

  if (error) {
    console.error('[PushNotifications] Failed to unsubscribe:', error.message);
  }
}

export async function getSubscriptions(
  supabase: SupabaseClient,
  userId: string
): Promise<{ endpoint: string; p256dh: string; auth_key: string }[]> {
  const { data } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('user_id', userId);

  return data || [];
}

export async function sendPush(
  supabase: SupabaseClient,
  subscriptions: { endpoint: string; p256dh: string; auth_key: string }[],
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (subscriptions.length === 0) return { sent: 0, failed: 0 };

  const webpush = await import('web-push');

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:ziv@dailycookie.co';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('[PushNotifications] VAPID keys not configured');
    return { sent: 0, failed: 0 };
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err: any) {
      failed++;
      // Remove expired subscriptions
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', sub.endpoint);
      }
      console.error('[PushNotifications] Send failed:', err.message);
    }
  }

  return { sent, failed };
}

export function buildPushPayload(
  title: string,
  body: string,
  url?: string
): PushPayload {
  return { title, body, url, icon: '/icon-192x192.png' };
}
