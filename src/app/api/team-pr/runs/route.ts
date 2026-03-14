import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/runs
 * List runs with filters: ?client_id=, ?status=, ?limit=, ?offset=
 * Joins client name and territory name.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('pr_runs')
    .select(`
      *,
      client:pr_clients(id, name, company),
      territory:pr_territories(id, name, country_code)
    `, { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (clientId) query = query.eq('client_id', clientId);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ items: data, total: count });
}

/**
 * POST /api/team-pr/runs
 * Start a new PR pipeline run.
 * Creates a pr_runs row with status='PENDING' and a vps_jobs row to trigger processing.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    client_id: string;
    territory_id?: string;
    max_outlets?: number;
    search_queries?: string[];
  }>(request);
  if (!body.ok) return body.response;

  if (!body.body.client_id?.trim()) {
    return errorResponse('client_id is required');
  }

  const { supabase, userId } = auth.ctx;

  // Create the run
  const { data: run, error: runError } = await supabase
    .from('pr_runs')
    .insert({
      user_id: userId,
      client_id: body.body.client_id,
      territory_id: body.body.territory_id || null,
      max_outlets: body.body.max_outlets || 50,
      search_queries: body.body.search_queries || [],
      status: 'PENDING',
    })
    .select()
    .single();

  if (runError) return errorResponse(runError.message, 500);

  // Create a vps_jobs row to trigger pipeline processing
  const { error: jobError } = await supabase
    .from('vps_jobs')
    .insert({
      type: 'pr_pipeline',
      payload: {
        run_id: run.id,
        client_id: body.body.client_id,
        territory_id: body.body.territory_id || null,
      },
      status: 'pending',
      user_id: userId,
    });

  if (jobError) {
    // Rollback: delete the run if job creation fails
    await supabase.from('pr_runs').delete().eq('id', run.id);
    return errorResponse(jobError.message, 500);
  }

  return successResponse(run, 201);
}
