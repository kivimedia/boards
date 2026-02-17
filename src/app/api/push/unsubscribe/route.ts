import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { unsubscribe } from '@/lib/push-notifications';

interface UnsubscribeBody {
  endpoint: string;
}

/**
 * POST /api/push/unsubscribe
 * Unsubscribe from push notifications.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UnsubscribeBody>(request);
  if (!parsed.ok) return parsed.response;

  const { endpoint } = parsed.body;

  if (!endpoint?.trim()) return errorResponse('endpoint is required');

  const { supabase, userId } = auth.ctx;

  try {
    await unsubscribe(supabase, userId, endpoint);
    return successResponse(null);
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to unsubscribe', 500);
  }
}
