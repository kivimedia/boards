import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getMessages, getWhatsAppUser } from '@/lib/whatsapp';

/**
 * GET /api/whatsapp/messages
 * List WhatsApp messages with optional filters.
 * Query params: group_id, message_type, limit
 * Messages are scoped to the current user's whatsapp_user_id by default.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const groupId = searchParams.get('group_id') || undefined;
  const messageType = searchParams.get('message_type') || undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 200)) {
    return errorResponse('limit must be a number between 1 and 200');
  }

  // Get the user's WhatsApp profile to scope messages
  const waUser = await getWhatsAppUser(supabase, userId);
  const whatsappUserId = waUser?.id;

  const messages = await getMessages(supabase, {
    whatsappUserId,
    groupId,
    messageType,
    limit,
  });

  return successResponse(messages);
}
