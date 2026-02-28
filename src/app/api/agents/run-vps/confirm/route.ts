import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/agents/run-vps/confirm
 * Set confirmation_decision on a paused agent job.
 * The VPS agent-confirmation-watcher picks this up and resumes the job.
 *
 * Body: {
 *   job_id: string;
 *   decision: 'approve' | 'reject';
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { job_id: string; decision: 'approve' | 'reject' };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.job_id || !body.decision) {
    return errorResponse('job_id and decision are required', 400);
  }

  if (!['approve', 'reject'].includes(body.decision)) {
    return errorResponse('decision must be "approve" or "reject"', 400);
  }

  // Verify job exists, is paused, and belongs to user
  const { data: job, error: jobErr } = await supabase
    .from('vps_jobs')
    .select('id, status, job_type, user_id, progress_data')
    .eq('id', body.job_id)
    .single();

  if (jobErr || !job) {
    return errorResponse('Job not found', 404);
  }

  if (job.status !== 'paused') {
    return errorResponse(`Job is not paused (current status: ${job.status})`, 400);
  }

  if (job.job_type !== 'agent') {
    return errorResponse('This endpoint is for agent jobs only', 400);
  }

  const progressData = job.progress_data as Record<string, unknown> | null;
  if (!progressData?.confirmation_needed) {
    return errorResponse('Job is not waiting for confirmation', 400);
  }

  // Set the confirmation decision - the watcher will pick this up
  const { error: updateErr } = await supabase
    .from('vps_jobs')
    .update({
      progress_data: {
        ...progressData,
        confirmation_decision: body.decision,
      },
    })
    .eq('id', body.job_id);

  if (updateErr) {
    return errorResponse(`Failed to update job: ${updateErr.message}`, 500);
  }

  return successResponse({
    job_id: body.job_id,
    decision: body.decision,
    message: `Confirmation ${body.decision}d`,
  });
}
