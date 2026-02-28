import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/teams/runs - List team runs (includes PageForge builds)
 * Optional query params: client_id
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');

  // Fetch regular team runs
  let teamQuery = supabase
    .from('agent_team_runs')
    .select('*, template:agent_team_templates(id, slug, name, icon), client:clients(id, name), site_config:seo_team_configs(id, site_name, site_url)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (clientId) teamQuery = teamQuery.eq('client_id', clientId);

  const { data: teamRuns, error: teamErr } = await teamQuery;
  if (teamErr) return errorResponse(teamErr.message, 500);

  // Fetch PageForge builds and map to team run shape
  let pfQuery = supabase
    .from('pageforge_builds')
    .select('id, status, current_phase, total_cost_usd, client_id, site_profile_id, page_title, figma_file_key, page_slug, vqa_score_overall, artifacts, created_at, site_profile:pageforge_site_profiles(id, site_name, site_url)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (clientId) pfQuery = pfQuery.eq('client_id', clientId);

  const { data: pfBuilds } = await pfQuery;

  // Map PageForge builds to team run shape
  const PHASE_ORDER = [
    'pending', 'preflight', 'figma_analysis', 'section_classification',
    'markup_generation', 'markup_validation', 'deploy_draft', 'image_optimization',
    'vqa_capture', 'vqa_comparison', 'vqa_fix_loop', 'functional_qa',
    'seo_config', 'report_generation', 'developer_review_gate', 'am_signoff_gate',
    'published', 'failed', 'cancelled',
  ];

  const pfMapped = (pfBuilds || []).map((b: any) => ({
    id: b.id,
    status: b.status === 'developer_review_gate' ? 'awaiting_developer_review_gate'
          : b.status === 'am_signoff_gate' ? 'awaiting_am_signoff_gate'
          : ['published', 'failed', 'cancelled'].includes(b.status) ? b.status === 'published' ? 'completed' : b.status
          : 'running',
    current_phase: Math.max(0, PHASE_ORDER.indexOf(b.status)),
    total_cost_usd: b.total_cost_usd || 0,
    client_id: b.client_id,
    site_config_id: b.site_profile_id,
    input_data: {
      topic: b.page_title,
      figma_file_key: b.figma_file_key,
      page_slug: b.page_slug,
      vqa_score: b.vqa_score_overall,
    },
    created_at: b.created_at,
    template: { id: '18ee770d-9fa5-45dd-a7c5-88f791526c0e', slug: 'pageforge', name: 'PageForge', icon: 'hammer' },
    client: null,
    site_config: b.site_profile ? { id: b.site_profile.id, site_name: b.site_profile.site_name, site_url: b.site_profile.site_url } : null,
    _is_pageforge: true,
  }));

  // Merge and sort by created_at descending
  const all = [...(teamRuns || []), ...pfMapped].sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return successResponse(all);
}
