import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { PGAAgentType } from '@/lib/types';

/**
 * GET /api/podcast/runs
 * List agent runs with optional filters: agent_type, status
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const agentType = searchParams.get('agent_type') as PGAAgentType | null;
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('pga_agent_runs')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (agentType) query = query.eq('agent_type', agentType);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ runs: data, total: count });
}

/**
 * POST /api/podcast/runs
 * Create a new agent run (scout or outreach)
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    agent_type: PGAAgentType;
  }>(request);
  if (!body.ok) return body.response;

  if (!body.body.agent_type || !['scout', 'outreach'].includes(body.body.agent_type)) {
    return errorResponse('agent_type must be "scout" or "outreach"');
  }

  const { supabase } = auth.ctx;

  // Check if there's already a running job of this type
  const { data: running } = await supabase
    .from('pga_agent_runs')
    .select('id')
    .eq('agent_type', body.body.agent_type)
    .eq('status', 'running')
    .limit(1);

  if (running && running.length > 0) {
    return errorResponse(`A ${body.body.agent_type} agent is already running`, 409);
  }

  const { data, error } = await supabase
    .from('pga_agent_runs')
    .insert({
      agent_type: body.body.agent_type,
      status: 'running',
      started_by: auth.ctx.userId,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
