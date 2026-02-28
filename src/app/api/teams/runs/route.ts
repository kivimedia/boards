import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/teams/runs - List team runs
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('agent_team_runs')
    .select('*, template:agent_team_templates(id, slug, name, icon)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return errorResponse(error.message, 500);

  return successResponse(data);
}
