import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string; checklistId: string };
}

interface CreateChecklistItemBody {
  content: string;
  position?: number;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateChecklistItemBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.content?.trim()) return errorResponse('Item content is required');

  const { supabase, userId } = auth.ctx;
  const { id: cardId, checklistId } = params;

  // Verify checklist belongs to this card
  const { data: checklist } = await supabase
    .from('checklists')
    .select('id')
    .eq('id', checklistId)
    .eq('card_id', cardId)
    .single();

  if (!checklist) return errorResponse('Checklist not found', 404);

  // Determine position if not provided
  let position = body.body.position;
  if (position === undefined) {
    const { data: existing } = await supabase
      .from('checklist_items')
      .select('position')
      .eq('checklist_id', checklistId)
      .order('position', { ascending: false })
      .limit(1);

    position = existing && existing.length > 0 ? (existing[0].position as number) + 1 : 0;
  }

  const { data, error } = await supabase
    .from('checklist_items')
    .insert({
      checklist_id: checklistId,
      content: body.body.content.trim(),
      position,
      is_completed: false,
    })
    .select('*')
    .single();

  if (error) return errorResponse(error.message, 500);

  // Log activity
  await supabase.from('activity_log').insert({
    card_id: cardId,
    user_id: userId,
    event_type: 'checklist_created',
    metadata: { checklist_id: checklistId, item_id: data.id, content: data.content },
  });

  return successResponse(data, 201);
}
