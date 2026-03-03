import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { enqueueJob } from '@/lib/outreach/orchestrator';
import type { LIJobType } from '@/lib/types';

const VALID_JOB_TYPES: LIJobType[] = [
  'SCOUT_IMPORT', 'SCOUT_ENRICH', 'QUALIFY', 'GENERATE_OUTREACH',
  'WEB_RESEARCH', 'PERSONALIZE_MESSAGE', 'FOLLOW_UP_CHECK',
  'RECOVERY', 'FEEDBACK_COLLECT', 'AB_EVALUATE', 'PURGE_TRASH',
];

/**
 * GET /api/outreach/jobs - List jobs with filters
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const status = searchParams.get('status');
  const jobType = searchParams.get('job_type');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;

  let query = supabase
    .from('li_jobs')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (jobType) query = query.eq('job_type', jobType);

  const { data, error, count } = await query;

  if (error) return errorResponse(error.message, 500);

  return successResponse({
    jobs: data || [],
    total: count || 0,
    page,
    limit,
  });
}

/**
 * POST /api/outreach/jobs - Enqueue a new job
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { job_type?: string; payload?: Record<string, unknown>; priority?: number };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.job_type || !VALID_JOB_TYPES.includes(body.job_type as LIJobType)) {
    return errorResponse(`Invalid job_type. Must be one of: ${VALID_JOB_TYPES.join(', ')}`, 400);
  }

  try {
    const jobId = await enqueueJob(
      supabase,
      userId,
      body.job_type as LIJobType,
      body.payload || {},
      body.priority
    );

    return successResponse({ job_id: jobId }, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to enqueue job', 500);
  }
}
