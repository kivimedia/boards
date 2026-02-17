import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface ToggleAssigneeBody {
  user_id: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<ToggleAssigneeBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.user_id) return errorResponse('user_id is required');

  const { supabase } = auth.ctx;
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
    return successResponse({ action: 'added' }, 201);
  }
}
