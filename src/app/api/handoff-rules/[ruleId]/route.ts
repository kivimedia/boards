import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { ruleId: string };
}

interface UpdateHandoffRuleBody {
  name?: string;
  source_board_id?: string;
  source_column?: string;
  target_board_id?: string;
  target_column?: string;
  inherit_fields?: string[];
  is_active?: boolean;
}

/**
 * PATCH /api/handoff-rules/[ruleId]
 * Update a handoff rule.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateHandoffRuleBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { ruleId } = params;

  const updates: Record<string, unknown> = {};

  if (body.body.name !== undefined) {
    if (!body.body.name.trim()) return errorResponse('Rule name cannot be empty');
    updates.name = body.body.name.trim();
  }
  if (body.body.source_board_id !== undefined) updates.source_board_id = body.body.source_board_id;
  if (body.body.source_column !== undefined) updates.source_column = body.body.source_column.trim();
  if (body.body.target_board_id !== undefined) updates.target_board_id = body.body.target_board_id;
  if (body.body.target_column !== undefined) updates.target_column = body.body.target_column.trim();
  if (body.body.inherit_fields !== undefined) updates.inherit_fields = body.body.inherit_fields;
  if (body.body.is_active !== undefined) updates.is_active = body.body.is_active;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('handoff_rules')
    .update(updates)
    .eq('id', ruleId)
    .select('*, source_board:boards!handoff_rules_source_board_id_fkey(id, name), target_board:boards!handoff_rules_target_board_id_fkey(id, name)')
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Handoff rule not found', 404);

  return successResponse(data);
}

/**
 * DELETE /api/handoff-rules/[ruleId]
 * Delete a handoff rule.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { ruleId } = params;

  const { error } = await supabase
    .from('handoff_rules')
    .delete()
    .eq('id', ruleId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
