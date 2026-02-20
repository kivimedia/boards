import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { jobId: string };
}

/**
 * POST /api/migration/jobs/[jobId]/launch
 * Launch all pending child jobs of a parent in parallel.
 * Fires fetch() calls to /run-board for each child as fire-and-forget.
 * Returns immediately with the count of launched children.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { jobId } = params;

  // Verify this is a parent job
  const { data: parent, error: parentErr } = await supabase
    .from('migration_jobs')
    .select('id, parent_job_id')
    .eq('id', jobId)
    .single();

  if (parentErr || !parent) return errorResponse('Parent job not found', 404);
  if (parent.parent_job_id) return errorResponse('This endpoint is only for parent jobs');

  // Fetch pending children
  const { data: children, error: childErr } = await supabase
    .from('migration_jobs')
    .select('id, status')
    .eq('parent_job_id', jobId)
    .eq('status', 'pending')
    .order('board_index');

  if (childErr) return errorResponse(childErr.message, 500);

  // Mark parent as running
  await supabase
    .from('migration_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId);

  // Extract the origin for absolute URLs
  const origin = request.headers.get('origin') || request.nextUrl.origin;
  const cookies = request.headers.get('cookie') || '';

  // Fire all children in parallel (fire-and-forget)
  let launched = 0;
  for (const child of children || []) {
    fetch(`${origin}/api/migration/jobs/${child.id}/run-board`, {
      method: 'POST',
      headers: { cookie: cookies },
    }).catch(() => {
      // Fire-and-forget: connection may close, that's fine
    });
    launched++;
  }

  return successResponse({ launched, total_children: (children || []).length });
}
