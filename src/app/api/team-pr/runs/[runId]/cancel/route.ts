import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/team-pr/runs/[runId]/cancel
 * Cancel a run. Sets status to CANCELLED and marks any linked vps_job as completed.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { runId } = params;
  const now = new Date().toISOString();

  // Fetch and verify ownership
  const { data: run, error: fetchError } = await supabase
    .from('pr_runs')
    .select('id, status, vps_job_id')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !run) return errorResponse('Run not found', 404);

  if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
    return errorResponse('Run already finished', 400);
  }

  // Cancel the run
  const { data, error } = await supabase
    .from('pr_runs')
    .update({ status: 'CANCELLED', updated_at: now })
    .eq('id', runId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  // Also mark vps_job as completed if linked
  if (run.vps_job_id) {
    await supabase
      .from('vps_jobs')
      .update({ status: 'completed', updated_at: now })
      .eq('id', run.vps_job_id);
  }

  return successResponse(data);
}
