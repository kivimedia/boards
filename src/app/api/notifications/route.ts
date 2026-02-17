import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createNotification } from '@/lib/notification-service';
import type { NotificationType } from '@/lib/types';

/**
 * GET /api/notifications
 * List notifications for the current user. Accept optional ?unread=true.
 * Ordered by created_at desc. Limit 50.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread') === 'true';

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateNotificationBody {
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string;
  card_id?: string;
  board_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * POST /api/notifications
 * Create a notification (used by system/automation).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateNotificationBody>(request);
  if (!parsed.ok) return parsed.response;

  const { user_id, type, title, body, card_id, board_id, metadata } = parsed.body;

  if (!user_id) return errorResponse('user_id is required');
  if (!type) return errorResponse('type is required');
  if (!title?.trim()) return errorResponse('title is required');

  const { supabase } = auth.ctx;

  await createNotification(supabase, {
    userId: user_id,
    type,
    title: title.trim(),
    body: body?.trim(),
    cardId: card_id,
    boardId: board_id,
    metadata,
  });

  // Fetch the created notification to return it
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
