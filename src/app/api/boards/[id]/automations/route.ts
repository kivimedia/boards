import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import {
  getAutomationRules,
  createAutomationRule,
} from '@/lib/automation-rules-builder';
import type { AutomationTriggerType, AutomationActionType } from '@/lib/types';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/automations
 * List all automation rules for a board, ordered by execution_order.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  const rules = await getAutomationRules(supabase, boardId);
  return successResponse(rules);
}

interface CreateRuleBody {
  name: string;
  description?: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  conditions?: Record<string, unknown>[];
}

/**
 * POST /api/boards/[id]/automations
 * Create a new automation rule for a board.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateRuleBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase, userId } = auth.ctx;
  const boardId = params.id;
  const body = parsed.body;

  if (!body.name?.trim()) return errorResponse('name is required');
  if (!body.trigger_type) return errorResponse('trigger_type is required');
  if (!body.action_type) return errorResponse('action_type is required');

  const rule = await createAutomationRule(supabase, {
    boardId,
    name: body.name.trim(),
    description: body.description,
    triggerType: body.trigger_type,
    triggerConfig: body.trigger_config || {},
    actionType: body.action_type,
    actionConfig: body.action_config || {},
    conditions: body.conditions,
    createdBy: userId,
  });

  if (!rule) return errorResponse('Failed to create automation rule', 500);
  return successResponse(rule, 201);
}
