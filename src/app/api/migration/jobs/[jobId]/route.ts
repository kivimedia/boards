import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { jobId: string };
}

/**
 * GET /api/migration/jobs/[jobId]
 * Get a single migration job (for progress tracking).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { jobId } = params;

  const { data, error } = await supabase
    .from('migration_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Migration job not found', 404);

  return successResponse(data);
}

interface UpdateJobBody {
  status?: string;
}

/**
 * PATCH /api/migration/jobs/[jobId]
 * Update job status. Only allow setting status to 'cancelled' (to cancel a running job).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateJobBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { jobId } = params;

  const { status } = body.body;

  if (status !== 'cancelled') {
    return errorResponse('Only status "cancelled" is allowed');
  }

  // Verify the job exists and is in a cancellable state
  const { data: existing, error: fetchError } = await supabase
    .from('migration_jobs')
    .select('status')
    .eq('id', jobId)
    .single();

  if (fetchError || !existing) return errorResponse('Migration job not found', 404);

  if (existing.status !== 'pending' && existing.status !== 'running') {
    return errorResponse(`Cannot cancel a job with status "${existing.status}"`);
  }

  const { data, error } = await supabase
    .from('migration_jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  // Cascade cancel to all children if this is a parent job
  const { data: children } = await supabase
    .from('migration_jobs')
    .select('id, status')
    .eq('parent_job_id', jobId)
    .in('status', ['pending', 'running']);

  if (children && children.length > 0) {
    await supabase
      .from('migration_jobs')
      .update({ status: 'cancelled' })
      .eq('parent_job_id', jobId)
      .in('status', ['pending', 'running']);
  }

  return successResponse({
    ...data,
    children_cancelled: children?.length ?? 0,
  });
}

/**
 * DELETE /api/migration/jobs/[jobId]
 * Delete a job (only if status is 'completed', 'failed', or 'cancelled').
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { jobId } = params;

  // Verify the job exists and is in a deletable state
  const { data: existing, error: fetchError } = await supabase
    .from('migration_jobs')
    .select('status')
    .eq('id', jobId)
    .single();

  if (fetchError || !existing) return errorResponse('Migration job not found', 404);

  const deletableStatuses = ['completed', 'failed', 'cancelled'];
  if (!deletableStatuses.includes(existing.status)) {
    return errorResponse(`Cannot delete a job with status "${existing.status}". Job must be completed, failed, or cancelled.`);
  }

  const { error } = await supabase
    .from('migration_jobs')
    .delete()
    .eq('id', jobId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
