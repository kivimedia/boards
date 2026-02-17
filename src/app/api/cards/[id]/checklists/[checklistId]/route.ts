import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string; checklistId: string };
}

interface UpdateChecklistBody {
  title?: string;
  position?: number;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateChecklistBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { checklistId } = params;

  const updates: Record<string, unknown> = {};
  if (body.body.title !== undefined) {
    if (!body.body.title.trim()) return errorResponse('Checklist title cannot be empty');
    updates.title = body.body.title.trim();
  }
  if (body.body.position !== undefined) {
    updates.position = body.body.position;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('checklists')
    .update(updates)
    .eq('id', checklistId)
    .eq('card_id', params.id)
    .select('*, items:checklist_items(*)')
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Checklist not found', 404);

  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { checklistId } = params;

  // Delete all items first
  await supabase
    .from('checklist_items')
    .delete()
    .eq('checklist_id', checklistId);

  const { error } = await supabase
    .from('checklists')
    .delete()
    .eq('id', checklistId)
    .eq('card_id', params.id);

  if (error) return errorResponse(error.message, 500);

  return successResponse({ deleted: true });
}
