import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { jobId: string };
}

/**
 * GET /api/migration/jobs/[jobId]/entities
 * List migration entity mappings for a job. Accept optional ?source_type=X filter.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { jobId } = params;
  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get('source_type');

  let query = supabase
    .from('migration_entity_map')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (sourceType) {
    query = query.eq('source_type', sourceType);
  }

  const { data, error } = await query;

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
