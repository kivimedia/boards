import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { dispatchNotification } from '@/lib/whatsapp';

interface NotifyBody {
  user_id: string;
  event_type: string;
  content: string;
  notification_id?: string;
  card_id?: string;
  board_id?: string;
}

/**
 * POST /api/whatsapp/notify
 * Dispatch a notification to a user via WhatsApp.
 * Respects DND, throttle, opt-out, and verification status.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<NotifyBody>(request);
  if (!parsed.ok) return parsed.response;

  const { user_id, event_type, content, notification_id, card_id, board_id } = parsed.body;

  if (!user_id?.trim()) {
    return errorResponse('user_id is required');
  }

  if (!event_type?.trim()) {
    return errorResponse('event_type is required');
  }

  if (!content?.trim()) {
    return errorResponse('content is required');
  }

  const { supabase } = auth.ctx;

  const log = await dispatchNotification(supabase, {
    userId: user_id.trim(),
    eventType: event_type.trim(),
    content: content.trim(),
    notificationId: notification_id?.trim(),
    cardId: card_id?.trim(),
    boardId: board_id?.trim(),
  });

  if (!log) {
    return successResponse({ dispatched: false, reason: 'User not eligible for WhatsApp notifications' });
  }

  return successResponse({
    dispatched: !log.throttled,
    throttled: log.throttled,
    throttle_reason: log.throttle_reason,
    log_id: log.id,
  });
}
