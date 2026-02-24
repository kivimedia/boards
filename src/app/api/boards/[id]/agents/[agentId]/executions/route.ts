import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { listExecutions, createExecution } from '@/lib/agent-engine';

/**
 * GET /api/boards/[id]/agents/[agentId]/executions — List execution history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; agentId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') ?? '25');
    const offset = parseInt(url.searchParams.get('offset') ?? '0');
    const status = url.searchParams.get('status') as any;

    const executions = await listExecutions(auth.ctx.supabase, {
      board_agent_id: params.agentId,
      status,
      limit,
      offset,
    });

    return successResponse(executions);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}

/**
 * POST /api/boards/[id]/agents/[agentId]/executions — Trigger agent manually
 * Body: { input_message, card_id?, trigger_data? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; agentId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    if (!body.input_message) {
      return errorResponse('input_message is required', 400);
    }

    // Get the board agent to find skill_id
    const { data: boardAgent } = await auth.ctx.supabase
      .from('board_agents')
      .select('skill_id')
      .eq('id', params.agentId)
      .single();

    if (!boardAgent) return errorResponse('Agent not found', 404);

    const execution = await createExecution(auth.ctx.supabase, {
      board_agent_id: params.agentId,
      skill_id: boardAgent.skill_id,
      board_id: params.id,
      card_id: body.card_id,
      user_id: auth.ctx.userId,
      trigger_type: 'manual',
      trigger_data: body.trigger_data ?? {},
      input_message: body.input_message,
      input_context: body.input_context ?? {},
    });

    return successResponse(execution, 201);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
