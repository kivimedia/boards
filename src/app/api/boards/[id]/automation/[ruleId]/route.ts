import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import { AutomationTriggerType, AutomationActionType } from '@/lib/types';

interface Params {
  params: { id: string; ruleId: string };
}

interface UpdateRuleBody {
  name?: string;
  is_active?: boolean;
  trigger_type?: AutomationTriggerType;
  trigger_config?: Record<string, unknown>;
  action_type?: AutomationActionType;
  action_config?: Record<string, unknown>;
  execution_order?: number;
}

/**
 * PATCH /api/boards/[id]/automation/[ruleId]
 * Update an automation rule.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateRuleBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { id: boardId, ruleId } = params;

  const updates: Record<string, unknown> = {};

  if (body.body.name !== undefined) {
    if (!body.body.name.trim()) return errorResponse('Rule name cannot be empty');
    updates.name = body.body.name.trim();
  }
  if (body.body.is_active !== undefined) {
    updates.is_active = body.body.is_active;
  }
  if (body.body.trigger_type !== undefined) {
    updates.trigger_type = body.body.trigger_type;
  }
  if (body.body.trigger_config !== undefined) {
    updates.trigger_config = body.body.trigger_config;
  }
  if (body.body.action_type !== undefined) {
    updates.action_type = body.body.action_type;
  }
  if (body.body.action_config !== undefined) {
    updates.action_config = body.body.action_config;
  }
  if (body.body.execution_order !== undefined) {
    updates.execution_order = body.body.execution_order;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('automation_rules')
    .update(updates)
    .eq('id', ruleId)
    .eq('board_id', boardId)
    .select('*')
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Automation rule not found', 404);

  return successResponse(data);
}

/**
 * DELETE /api/boards/[id]/automation/[ruleId]
 * Delete an automation rule.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: boardId, ruleId } = params;

  // Delete any related automation logs first
  await supabase
    .from('automation_log')
    .delete()
    .eq('rule_id', ruleId);

  const { error } = await supabase
    .from('automation_rules')
    .delete()
    .eq('id', ruleId)
    .eq('board_id', boardId);

  if (error) return errorResponse(error.message, 500);

  return successResponse({ deleted: true });
}
