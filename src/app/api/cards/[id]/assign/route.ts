import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface AssignBody {
  user_id: string;
}

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

/**
 * POST /api/cards/[id]/assign
 * Body: { user_id: string }
 * Assigns a card to a user and creates a notification.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  const body = await parseBody<AssignBody>(request);
  if (!body.ok) return body.response;

  const targetUserId = body.body.user_id;
  if (!targetUserId) return errorResponse('user_id is required');

  // Skip if assigning to self (no notification needed)
  if (targetUserId === userId) {
    // Just create the assignment, no notification
    const { error } = await supabase
      .from('card_assignees')
      .upsert({ card_id: cardId, user_id: targetUserId }, { onConflict: 'card_id,user_id' });
    if (error) return errorResponse(error.message, 500);
    return successResponse({ assigned: true });
  }

  // Get card title and board_id for notification
  const db = getAdminClient() ?? supabase;
  const { data: placement } = await db
    .from('card_placements')
    .select('list_id, card_id, lists(id, board_id), cards(id, title)')
    .eq('card_id', cardId)
    .eq('is_mirror', false)
    .limit(1)
    .single();

  if (!placement) return errorResponse('Card not found', 404);

  const boardId = (placement.lists as any)?.board_id ?? null;
  const cardTitle = (placement.cards as any)?.title || 'Card';
  const assignerProfile = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single();
  const assignerName = assignerProfile.data?.display_name || 'Someone';

  // Create the assignment
  const { error: assignError } = await supabase
    .from('card_assignees')
    .upsert({ card_id: cardId, user_id: targetUserId }, { onConflict: 'card_id,user_id' });

  if (assignError) return errorResponse(assignError.message, 500);

  // Create notification (non-blocking)
  supabase
    .from('notifications')
    .insert({
      user_id: targetUserId,
      type: 'card_assigned',
      title: `${assignerName} assigned you: ${cardTitle}`,
      body: '',
      card_id: cardId,
      board_id: boardId,
      metadata: { assigner_id: userId },
    })
    .catch(() => {}); // Silently fail if notification insert fails

  return successResponse({ assigned: true });
}
