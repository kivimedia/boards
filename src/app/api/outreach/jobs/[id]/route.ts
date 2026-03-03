import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { enqueueJob } from '@/lib/outreach/orchestrator';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/outreach/jobs/[id] - Job details
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  const { data, error } = await supabase
    .from('li_jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !data) return errorResponse('Job not found', 404);

  return successResponse({ job: data });
}

/**
 * PATCH /api/outreach/jobs/[id] - Cancel or retry a job
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  // Fetch current job
  const { data: job, error: fetchError } = await supabase
    .from('li_jobs')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !job) return errorResponse('Job not found', 404);

  if (body.action === 'cancel') {
    if (!['PENDING', 'RUNNING'].includes(job.status)) {
      return errorResponse('Can only cancel PENDING or RUNNING jobs', 400);
    }

    const { error } = await supabase
      .from('li_jobs')
      .update({
        status: 'CANCELLED',
        locked_by: null,
        lock_expires_at: null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) return errorResponse(error.message, 500);
    return successResponse({ message: 'Job cancelled' });
  }

  if (body.action === 'retry') {
    if (job.status !== 'FAILED') {
      return errorResponse('Can only retry FAILED jobs', 400);
    }

    // Create a new job with the same type and payload
    try {
      const newJobId = await enqueueJob(
        supabase,
        userId,
        job.job_type,
        job.payload || {},
        job.priority
      );
      return successResponse({ message: 'Retry job created', new_job_id: newJobId });
    } catch (err) {
      return errorResponse(err instanceof Error ? err.message : 'Failed to retry', 500);
    }
  }

  return errorResponse('Invalid action. Must be "cancel" or "retry"', 400);
}
