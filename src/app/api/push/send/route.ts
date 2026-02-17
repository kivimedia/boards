import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getSubscriptions, sendPush, buildPushPayload } from '@/lib/push-notifications';

interface SendPushBody {
  user_id: string;
  title: string;
  body: string;
  url?: string;
}

/**
 * POST /api/push/send
 * Internal endpoint for sending push notifications.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<SendPushBody>(request);
  if (!parsed.ok) return parsed.response;

  const { user_id, title, body, url } = parsed.body;

  if (!user_id?.trim()) return errorResponse('user_id is required');
  if (!title?.trim()) return errorResponse('title is required');
  if (!body?.trim()) return errorResponse('body is required');

  const { supabase } = auth.ctx;

  try {
    const subscriptions = await getSubscriptions(supabase, user_id);
    const payload = buildPushPayload(title, body, url);
    const result = await sendPush(supabase, subscriptions, payload);
    return successResponse(result);
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to send push notification', 500);
  }
}
