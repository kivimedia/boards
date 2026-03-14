import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/runs/[runId]/outlets
 * List outlets for this run. Supports:
 * ?pipeline_stage=, ?verification_status=, ?qa_status=, ?search=, ?limit=, ?offset=
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { runId } = params;
  const { searchParams } = new URL(request.url);
  const pipelineStage = searchParams.get('pipeline_stage');
  const verificationStatus = searchParams.get('verification_status');
  const qaStatus = searchParams.get('qa_status');
  const search = searchParams.get('search');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  // Verify the run belongs to the user
  const { data: run, error: runError } = await supabase
    .from('pr_runs')
    .select('id')
    .eq('id', runId)
    .eq('user_id', userId)
    .single();

  if (runError || !run) return errorResponse('Run not found', 404);

  let query = supabase
    .from('pr_outlets')
    .select('*', { count: 'exact' })
    .eq('run_id', runId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (pipelineStage) query = query.eq('pipeline_stage', pipelineStage);
  if (verificationStatus) query = query.eq('verification_status', verificationStatus);
  if (qaStatus) query = query.eq('qa_status', qaStatus);
  if (search) {
    query = query.or(`name.ilike.%${search}%,outlet_code.ilike.%${search}%,contact_name.ilike.%${search}%,contact_email.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ items: data, total: count });
}
