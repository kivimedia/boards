import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params { params: { id: string } }

/**
 * POST /api/agents/sessions/:id/kill
 * Mark a running session as cancelled.
 * Client-side AbortController handles the actual stream interruption.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('agent_sessions')
    .update({ status: 'cancelled' })
    .eq('id', params.id)
    .eq('user_id', userId)
    .select('id, status')
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Session not found', 404);

  return successResponse(data);
}
