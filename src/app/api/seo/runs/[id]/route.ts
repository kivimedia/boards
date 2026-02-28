import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/seo/runs/[id]
 * Get a single SEO pipeline run with its associated agent calls.
 * Returns { run, agent_calls }.
 */
export async function GET(
  _request: NextRequest,
  { params }: Params
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = await params;

  // Fetch the pipeline run with team config
  const { data: run, error: runErr } = await supabase
    .from('seo_pipeline_runs')
    .select('*, team_config:seo_team_configs(id, site_name, site_url, client:clients(id, name))')
    .eq('id', id)
    .single();

  if (runErr || !run) {
    return errorResponse('Run not found', 404);
  }

  // Fetch related agent calls ordered by creation time
  const { data: agentCalls, error: callsErr } = await supabase
    .from('seo_agent_calls')
    .select('*')
    .eq('run_id', id)
    .order('created_at', { ascending: true });

  if (callsErr) return errorResponse(callsErr.message, 500);

  return successResponse({ run, agent_calls: agentCalls });
}
