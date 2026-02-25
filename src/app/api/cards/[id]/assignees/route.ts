import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface ToggleAssigneeBody {
  user_id: string;
}

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<ToggleAssigneeBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.user_id) return errorResponse('user_id is required');

  const { supabase, userId } = auth.ctx;
  const cardId = params.id;
  const { user_id } = body.body;

  // Check if already assigned
  const { data: existing } = await supabase
    .from('card_assignees')
    .select('*')
    .eq('card_id', cardId)
    .eq('user_id', user_id)
    .single();

  if (existing) {
    await supabase
      .from('card_assignees')
      .delete()
      .eq('card_id', cardId)
      .eq('user_id', user_id);
    return successResponse({ action: 'removed' });
  } else {
    const { error } = await supabase
      .from('card_assignees')
      .insert({ card_id: cardId, user_id });
    if (error) return errorResponse(error.message, 500);

    // Send notification to assignee (non-blocking)
    if (user_id !== userId) {
      const db = getAdminClient() ?? supabase;
      const [cardRes, placementRes, assignerRes] = await Promise.all([
        supabase.from('cards').select('title').eq('id', cardId).single(),
        db
          .from('card_placements')
          .select('list_id, lists(board_id)')
          .eq('card_id', cardId)
          .eq('is_mirror', false)
          .single(),
        supabase.from('profiles').select('display_name').eq('id', userId).single(),
      ]);

      const cardTitle = cardRes.data?.title || 'Card';
      const boardId = (placementRes.data?.lists as any)?.board_id ?? null;
      const assignerName = assignerRes.data?.display_name || 'Someone';

      supabase
        .from('notifications')
        .insert({
          user_id,
          type: 'card_assigned',
          title: `${assignerName} assigned you: ${cardTitle}`,
          body: '',
          card_id: cardId,
          board_id: boardId,
          metadata: { assigner_id: userId },
        })
        .then(() => {}); // Silently fail if notification insert fails
    }

    return successResponse({ action: 'added' }, 201);
  }
}
