import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import {
  updateAutomationRule,
  deleteAutomationRule,
} from '@/lib/automation-rules-builder';
import type { AutomationTriggerType, AutomationActionType } from '@/lib/types';

interface Params {
  params: { id: string; ruleId: string };
}

/**
 * GET /api/boards/[id]/automations/[ruleId]
 * Get a single automation rule.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: boardId, ruleId } = params;

  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('board_id', boardId)
    .single();

  if (error || !data) return errorResponse('Automation rule not found', 404);
  return successResponse(data);
}

interface UpdateRuleBody {
  name?: string;
  description?: string;
  is_active?: boolean;
  trigger_type?: AutomationTriggerType;
  trigger_config?: Record<string, unknown>;
  action_type?: AutomationActionType;
  action_config?: Record<string, unknown>;
  conditions?: Record<string, unknown>[];
  execution_order?: number;
}

/**
 * PATCH /api/boards/[id]/automations/[ruleId]
 * Update an automation rule.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateRuleBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const { ruleId } = params;
  const body = parsed.body;

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return errorResponse('name cannot be empty');
    updates.name = body.name.trim();
  }
  if (body.description !== undefined) updates.description = body.description;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.trigger_type !== undefined) updates.trigger_type = body.trigger_type;
  if (body.trigger_config !== undefined) updates.trigger_config = body.trigger_config;
  if (body.action_type !== undefined) updates.action_type = body.action_type;
  if (body.action_config !== undefined) updates.action_config = body.action_config;
  if (body.conditions !== undefined) updates.conditions = body.conditions;
  if (body.execution_order !== undefined) updates.execution_order = body.execution_order;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const rule = await updateAutomationRule(supabase, ruleId, updates);
  if (!rule) return errorResponse('Failed to update automation rule', 500);

  return successResponse(rule);
}

/**
 * DELETE /api/boards/[id]/automations/[ruleId]
 * Delete an automation rule.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { ruleId } = params;

  await deleteAutomationRule(supabase, ruleId);
  return successResponse({ deleted: true });
}
