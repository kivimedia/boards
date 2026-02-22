import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params { params: { id: string } }

/**
 * PATCH /api/agents/sessions/:id — Rename session
 * Body: { title: string }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  let body: { title: string };
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }

  if (!body.title?.trim()) return errorResponse('title is required', 400);

  const { data, error } = await supabase
    .from('agent_sessions')
    .update({ title: body.title.trim() })
    .eq('id', params.id)
    .eq('user_id', userId)
    .select('id, title')
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Session not found', 404);

  return successResponse(data);
}

/**
 * DELETE /api/agents/sessions/:id — Delete session (close tab)
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const { error } = await supabase
    .from('agent_sessions')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId);

  if (error) return errorResponse(error.message, 500);
  return successResponse(null);
}
