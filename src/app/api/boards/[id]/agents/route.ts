import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { listBoardAgents, addAgentToBoard } from '@/lib/agent-engine';

type Params = { params: { id: string } };

/**
 * GET /api/boards/[id]/agents — List agents on a board
 * Query params: include_inactive
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('include_inactive') === 'true';
    const agents = await listBoardAgents(auth.ctx.supabase, params.id, includeInactive);
    return successResponse(agents);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}

/**
 * POST /api/boards/[id]/agents — Add a skill to a board
 * Body: { skill_id, custom_prompt_additions?, model_preference?, auto_trigger_on?, requires_confirmation? }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    if (!body.skill_id) {
      return errorResponse('skill_id is required', 400);
    }

    const agent = await addAgentToBoard(auth.ctx.supabase, params.id, body.skill_id, {
      custom_prompt_additions: body.custom_prompt_additions,
      model_preference: body.model_preference,
      auto_trigger_on: body.auto_trigger_on,
      requires_confirmation: body.requires_confirmation,
    });

    return successResponse(agent, 201);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
