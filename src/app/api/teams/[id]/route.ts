import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/teams/[id] - Get template detail with recent runs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = await params;

  const { data: template, error } = await supabase
    .from('agent_team_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !template) return errorResponse('Template not found', 404);

  // Get recent runs for this template
  const { data: runs } = await supabase
    .from('agent_team_runs')
    .select('id, status, current_phase, total_cost_usd, input_data, created_at, updated_at')
    .eq('template_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  return successResponse({ template, runs: runs || [] });
}
