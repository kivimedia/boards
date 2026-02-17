import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { markAllNotificationsRead } from '@/lib/notification-service';

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for the current user.
 */
export async function POST() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    await markAllNotificationsRead(supabase, userId);
    return successResponse({ success: true });
  } catch {
    return errorResponse('Failed to mark all notifications as read', 500);
  }
}
