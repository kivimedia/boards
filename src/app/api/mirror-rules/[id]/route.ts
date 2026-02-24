import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface UpdateMirrorRuleBody {
  source_board_id?: string;
  source_list_name?: string;
  target_board_id?: string;
  target_list_name?: string;
  direction?: string;
  condition_field?: string | null;
  condition_value?: string | null;
  remove_from_source?: boolean;
  is_active?: boolean;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateMirrorRuleBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.source_board_id !== undefined) updates.source_board_id = body.body.source_board_id;
  if (body.body.source_list_name !== undefined) updates.source_list_name = body.body.source_list_name;
  if (body.body.target_board_id !== undefined) updates.target_board_id = body.body.target_board_id;
  if (body.body.target_list_name !== undefined) updates.target_list_name = body.body.target_list_name;
  if (body.body.direction !== undefined) updates.direction = body.body.direction;
  if (body.body.condition_field !== undefined) updates.condition_field = body.body.condition_field;
  if (body.body.condition_value !== undefined) updates.condition_value = body.body.condition_value;
  if (body.body.remove_from_source !== undefined) updates.remove_from_source = body.body.remove_from_source;
  if (body.body.is_active !== undefined) updates.is_active = body.body.is_active;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('mirror_rules')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { error } = await supabase
    .from('mirror_rules')
    .delete()
    .eq('id', params.id);

  if (error) return errorResponse(error.message, 500);
  return successResponse(null);
}
