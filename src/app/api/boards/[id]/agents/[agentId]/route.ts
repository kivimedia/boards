import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { updateBoardAgent, removeAgentFromBoard } from '@/lib/agent-engine';

type Params = { params: { id: string; agentId: string } };

/**
 * PUT /api/boards/[id]/agents/[agentId] — Update a board agent
 * Body: { is_active?, custom_prompt_additions?, model_preference?, auto_trigger_on?, requires_confirmation? }
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const agent = await updateBoardAgent(auth.ctx.supabase, params.agentId, body);
    return successResponse(agent);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}

/**
 * DELETE /api/boards/[id]/agents/[agentId] — Remove an agent from a board
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    await removeAgentFromBoard(auth.ctx.supabase, params.agentId);
    return successResponse({ deleted: true });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
