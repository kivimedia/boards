import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { subscribe } from '@/lib/push-notifications';

interface SubscribeBody {
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

/**
 * POST /api/push/subscribe
 * Subscribe to push notifications.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<SubscribeBody>(request);
  if (!parsed.ok) return parsed.response;

  const { endpoint, p256dh, auth_key } = parsed.body;

  if (!endpoint?.trim()) return errorResponse('endpoint is required');
  if (!p256dh?.trim()) return errorResponse('p256dh is required');
  if (!auth_key?.trim()) return errorResponse('auth_key is required');

  const { supabase, userId } = auth.ctx;

  try {
    await subscribe(supabase, userId, { endpoint, p256dh, auth_key });
    return successResponse(null, 201);
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to subscribe', 500);
  }
}
