import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

// Gate status -> next stage mapping
const GATE_TRANSITIONS: Record<string, string> = {
  'GATE_A': 'VERIFICATION',
  'GATE_B': 'QA_LOOP',
  'GATE_C': 'EMAIL_GEN',
};

/**
 * POST /api/team-pr/runs/[runId]/advance
 * Advance past a quality gate.
 * Body: { approved_outlet_ids?: string[], excluded_outlet_ids?: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    approved_outlet_ids?: string[];
    excluded_outlet_ids?: string[];
  }>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { runId } = params;

  // 1. Load the run, check status is a GATE_* status
  const { data: run, error: runError } = await supabase
    .from('pr_runs')
    .select('*')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (runError) return errorResponse('Run not found', 404);

  const nextStage = GATE_TRANSITIONS[run.status];
  if (!nextStage) {
    return errorResponse(`Run is not at a gate status. Current status: ${run.status}`, 400);
  }

  // 2. If excluded_outlet_ids provided, update those outlets to pipeline_stage='EXCLUDED'
  if (body.body.excluded_outlet_ids?.length) {
    const { error: excludeError } = await supabase
      .from('pr_outlets')
      .update({ pipeline_stage: 'EXCLUDED', updated_at: new Date().toISOString() })
      .eq('run_id', runId)
      .in('id', body.body.excluded_outlet_ids);

    if (excludeError) return errorResponse(excludeError.message, 500);
  }

  // 3. Advance the run status to the next stage
  const { data: updatedRun, error: updateError } = await supabase
    .from('pr_runs')
    .update({ status: nextStage, updated_at: new Date().toISOString() })
    .eq('id', runId)
    .select()
    .single();

  if (updateError) return errorResponse(updateError.message, 500);

  // 4. Create a new vps_jobs row to re-trigger processing
  const { error: jobError } = await supabase
    .from('vps_jobs')
    .insert({
      type: 'pr_pipeline',
      payload: {
        run_id: runId,
        client_id: run.client_id,
        territory_id: run.territory_id,
        stage: nextStage,
      },
      status: 'pending',
      user_id: userId,
    });

  if (jobError) return errorResponse(jobError.message, 500);

  return successResponse(updatedRun);
}
