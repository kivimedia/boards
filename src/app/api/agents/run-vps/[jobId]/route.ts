import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/agents/run-vps/[jobId]
 * Poll job status (fallback for when Realtime is unavailable).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { jobId } = await params;

  const { data: job, error } = await supabase
    .from('vps_jobs')
    .select('id, job_type, status, payload, progress_data, progress_message, output, output_preview, error_message, created_at, started_at, completed_at')
    .eq('id', jobId)
    .single();

  if (error || !job) {
    return errorResponse('Job not found', 404);
  }

  return successResponse({ job });
}
