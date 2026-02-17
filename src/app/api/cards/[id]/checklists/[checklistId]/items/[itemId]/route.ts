import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string; checklistId: string; itemId: string };
}

interface UpdateChecklistItemBody {
  content?: string;
  is_completed?: boolean;
  position?: number;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateChecklistItemBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { id: cardId, checklistId, itemId } = params;

  const updates: Record<string, unknown> = {};

  if (body.body.content !== undefined) {
    if (!body.body.content.trim()) return errorResponse('Item content cannot be empty');
    updates.content = body.body.content.trim();
  }

  if (body.body.position !== undefined) {
    updates.position = body.body.position;
  }

  if (body.body.is_completed !== undefined) {
    updates.is_completed = body.body.is_completed;
    if (body.body.is_completed) {
      updates.completed_by = userId;
      updates.completed_at = new Date().toISOString();
    } else {
      updates.completed_by = null;
      updates.completed_at = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('checklist_items')
    .update(updates)
    .eq('id', itemId)
    .eq('checklist_id', checklistId)
    .select('*')
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Checklist item not found', 404);

  // Log completion / uncompletion activity
  if (body.body.is_completed !== undefined) {
    await supabase.from('activity_log').insert({
      card_id: cardId,
      user_id: userId,
      event_type: body.body.is_completed
        ? 'checklist_item_completed'
        : 'checklist_item_uncompleted',
      metadata: {
        checklist_id: checklistId,
        item_id: itemId,
        content: data.content,
      },
    });
  }

  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { checklistId, itemId } = params;

  const { error } = await supabase
    .from('checklist_items')
    .delete()
    .eq('id', itemId)
    .eq('checklist_id', checklistId);

  if (error) return errorResponse(error.message, 500);

  return successResponse({ deleted: true });
}
