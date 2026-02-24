import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getSkill, updateSkill, getSkillRevisions, restoreSkillRevision } from '@/lib/agent-engine';

interface Params { params: { id: string } }

/**
 * GET /api/agents/skills/:id — Get a single skill
 * GET /api/agents/skills/:id?include=revisions — Get revision history
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);

    if (url.searchParams.get('include') === 'revisions') {
      const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
      const revisions = await getSkillRevisions(auth.ctx.supabase, params.id, limit);
      return successResponse(revisions);
    }

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
 * Body: { _action: 'restore', _revision_id: 'uuid' } to restore a revision
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    // Restore action
    if (body._action === 'restore' && body._revision_id) {
      const skill = await restoreSkillRevision(
        auth.ctx.supabase,
        params.id,
        body._revision_id,
        auth.ctx.userId
      );
      return successResponse(skill);
    }

    // Don't allow changing id or timestamps
    delete body.id;
    delete body.created_at;
    delete body.updated_at;

    const skill = await updateSkill(auth.ctx.supabase, params.id, body, auth.ctx.userId);
    return successResponse(skill);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
