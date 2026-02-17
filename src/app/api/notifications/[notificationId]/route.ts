import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { markNotificationRead } from '@/lib/notification-service';

interface Params {
  params: { notificationId: string };
}

interface UpdateNotificationBody {
  is_read: boolean;
}

/**
 * PATCH /api/notifications/[notificationId]
 * Mark notification as read. Only allow updating own notifications.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateNotificationBody>(request);
  if (!body.ok) return body.response;

  if (body.body.is_read !== true) {
    return errorResponse('Only is_read: true is supported');
  }

  const { supabase, userId } = auth.ctx;
  const { notificationId } = params;

  await markNotificationRead(supabase, notificationId, userId);

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', notificationId)
    .eq('user_id', userId)
    .single();

  if (error) return errorResponse('Notification not found', 404);
  return successResponse(data);
}

/**
 * DELETE /api/notifications/[notificationId]
 * Delete a notification. Only allow deleting own notifications.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { notificationId } = params;

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
