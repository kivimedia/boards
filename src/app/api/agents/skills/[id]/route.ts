import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getSkill, updateSkill } from '@/lib/agent-engine';

interface Params { params: { id: string } }

/**
 * GET /api/agents/skills/:id — Get a single skill
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const skill = await getSkill(auth.ctx.supabase, params.id);
    if (!skill) return errorResponse('Skill not found', 404);
    return successResponse(skill);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}

/**
 * PATCH /api/agents/skills/:id — Update a skill's fields
 * Body: partial skill object (any editable fields)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    // Don't allow changing id or timestamps
    delete body.id;
    delete body.created_at;
    delete body.updated_at;

    const skill = await updateSkill(auth.ctx.supabase, params.id, body);
    return successResponse(skill);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
