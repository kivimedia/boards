import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/seo/runs
 * List SEO pipeline runs with optional filters.
 * Query params: status, team_config_id, client_id, limit (default 20), offset (default 0)
 * Returns { runs, total } with count.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const status = searchParams.get('status');
  const teamConfigId = searchParams.get('team_config_id');
  const clientId = searchParams.get('client_id');
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('seo_pipeline_runs')
    .select('*, team_config:seo_team_configs(id, site_name, site_url, client:clients(id, name))', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (teamConfigId) query = query.eq('team_config_id', teamConfigId);
  if (clientId) query = query.eq('client_id', clientId);

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ runs: data, total: count });
}
