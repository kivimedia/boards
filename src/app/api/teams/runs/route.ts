import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/teams/runs - List team runs
 * Optional query params: client_id
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');

  let query = supabase
    .from('agent_team_runs')
    .select('*, template:agent_team_templates(id, slug, name, icon), client:clients(id, name), site_config:seo_team_configs(id, site_name, site_url)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;

  if (error) return errorResponse(error.message, 500);

  return successResponse(data);
}
