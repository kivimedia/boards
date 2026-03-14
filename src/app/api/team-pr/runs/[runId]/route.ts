import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/runs/[runId]
 * Run detail with counts of outlets at each pipeline_stage. Joins client and territory.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { runId } = params;

  // Fetch run with client and territory
  const { data: run, error: runError } = await supabase
    .from('pr_runs')
    .select(`
      *,
      client:pr_clients(id, name, company, industry),
      territory:pr_territories(id, name, country_code, language)
    `)
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (runError) return errorResponse('Run not found', 404);

  // Count outlets per pipeline_stage
  const { data: outlets, error: outletsError } = await supabase
    .from('pr_outlets')
    .select('pipeline_stage')
    .eq('run_id', runId);

  if (outletsError) return errorResponse(outletsError.message, 500);

  const stageCounts: Record<string, number> = {};
  for (const outlet of outlets || []) {
    const stage = outlet.pipeline_stage || 'UNKNOWN';
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  }

  return successResponse({ ...run, stage_counts: stageCounts });
}

/**
 * PATCH /api/team-pr/runs/[runId]
 * Update run (cancel only - set status='CANCELLED')
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    status: 'CANCELLED';
  }>(request);
  if (!body.ok) return body.response;

  if (body.body.status !== 'CANCELLED') {
    return errorResponse('Only CANCELLED status is allowed via PATCH');
  }

  const { supabase, userId } = auth.ctx;
  const { runId } = params;

  const { data, error } = await supabase
    .from('pr_runs')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
