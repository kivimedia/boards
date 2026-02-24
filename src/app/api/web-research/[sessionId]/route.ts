import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/web-research/[sessionId]
 * Get session details with tool calls.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { sessionId } = await params;

  const { data: session, error } = await supabase
    .from('web_research_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !session) {
    return errorResponse('Session not found', 404);
  }

  // Fetch tool calls
  const { data: toolCalls } = await supabase
    .from('web_research_tool_calls')
    .select('*')
    .eq('session_id', sessionId)
    .order('call_order', { ascending: true });

  return Response.json({ data: { ...session, tool_calls: toolCalls || [] } });
}

/**
 * DELETE /api/web-research/[sessionId]
 * Cancel running or delete completed session.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { sessionId } = await params;

  const { data: session } = await supabase
    .from('web_research_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!session) {
    return errorResponse('Session not found', 404);
  }

  if (session.status === 'running') {
    // Cancel running session
    await supabase.from('web_research_sessions').update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    }).eq('id', sessionId);

    return Response.json({ data: { cancelled: true } });
  }

  // Delete completed/failed session
  await supabase.from('web_research_sessions').delete().eq('id', sessionId);
  return Response.json({ data: { deleted: true } });
}
