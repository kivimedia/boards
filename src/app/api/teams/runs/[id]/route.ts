import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/teams/runs/[id] - Get run detail
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = await params;

  const { data: run, error } = await supabase
    .from('agent_team_runs')
    .select('*, template:agent_team_templates(*), client:clients(id, name), site_config:seo_team_configs(id, site_name, site_url)')
    .eq('id', id)
    .single();

  if (error || !run) return errorResponse('Run not found', 404);

  return successResponse(run);
}
