import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import { AutomationTriggerType, AutomationActionType } from '@/lib/types';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/automation
 * List all automation rules for a board, ordered by execution_order.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('board_id', boardId)
    .order('execution_order', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateRuleBody {
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  execution_order?: number;
}

/**
 * POST /api/boards/[id]/automation
 * Create a new automation rule for a board.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateRuleBody>(request);
  if (!body.ok) return body.response;

  const { name, trigger_type, trigger_config, action_type, action_config } =
    body.body;

  if (!name?.trim()) return errorResponse('Rule name is required');
  if (!trigger_type) return errorResponse('trigger_type is required');
  if (!action_type) return errorResponse('action_type is required');

  const { supabase, userId } = auth.ctx;
  const boardId = params.id;

  // Determine execution_order if not provided
  let executionOrder = body.body.execution_order;
  if (executionOrder === undefined) {
    const { data: existing } = await supabase
      .from('automation_rules')
      .select('execution_order')
      .eq('board_id', boardId)
      .order('execution_order', { ascending: false })
      .limit(1);

    executionOrder =
      existing && existing.length > 0
        ? (existing[0].execution_order as number) + 1
        : 0;
  }

  const { data, error } = await supabase
    .from('automation_rules')
    .insert({
      board_id: boardId,
      name: name.trim(),
      is_active: true,
      trigger_type,
      trigger_config: trigger_config || {},
      action_type,
      action_config: action_config || {},
      execution_order: executionOrder,
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
