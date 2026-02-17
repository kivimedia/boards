import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getUnreadCount } from '@/lib/notification-service';

/**
 * GET /api/notifications/count
 * Get unread notification count for the current user.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    const count = await getUnreadCount(supabase, userId);
    return successResponse({ count });
  } catch {
    return errorResponse('Failed to get unread count', 500);
  }
}
