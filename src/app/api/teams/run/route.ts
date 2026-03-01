import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/teams/run - Start a team run
 *
 * Body: {
 *   template_id: string;
 *   input_data: Record<string, unknown>; // e.g. { topic, silo }
 *   config?: Record<string, unknown>;    // runtime overrides
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: {
    template_id: string;
    input_data: Record<string, unknown>;
    config?: Record<string, unknown>;
    client_id?: string;
    site_config_id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.template_id) return errorResponse('template_id is required', 400);
  if (!body.input_data || typeof body.input_data !== 'object') {
    return errorResponse('input_data is required', 400);
  }

  // Verify template exists
  const { data: template, error: tErr } = await supabase
    .from('agent_team_templates')
    .select('id, slug, name')
    .eq('id', body.template_id)
    .eq('is_active', true)
    .single();

  if (tErr || !template) return errorResponse('Template not found', 404);

  // PageForge builds use their own table and VPS job type
  if (template.slug === 'pageforge') {
    const { figma_file_key, page_title, page_slug, model_profile, custom_models } = body.input_data as any;
    if (!figma_file_key || !page_title) {
      return errorResponse('figma_file_key and page_title are required for PageForge', 400);
    }

    // Fetch site profile to get page_builder
    const { data: siteProfile } = await supabase
      .from('pageforge_site_profiles')
      .select('page_builder')
      .eq('id', body.site_config_id || '')
      .single();

    // Create pageforge_build
    const { data: build, error: buildErr } = await supabase
      .from('pageforge_builds')
      .insert({
        site_profile_id: body.site_config_id || null,
        client_id: body.client_id || null,
        figma_file_key: figma_file_key,
        figma_node_ids: [],
        page_title,
        page_slug: page_slug || null,
        page_builder: siteProfile?.page_builder || 'gutenberg',
        status: 'pending',
        current_phase: 0,
        phase_results: {},
        artifacts: {
          model_profile: model_profile || 'cost_optimized',
          custom_models: custom_models || null,
        },
        error_log: [],
        total_cost_usd: 0,
        agent_costs: {},
        created_by: userId,
      })
      .select()
      .single();

    if (buildErr) return errorResponse(buildErr.message, 500);

    // Create VPS job
    const { data: job, error: jobErr } = await supabase
      .from('vps_jobs')
      .insert({
        job_type: 'pipeline:pageforge',
        status: 'queued',
        payload: {
          build_id: build.id,
          site_profile_id: body.site_config_id || null,
          model_profile: model_profile || 'cost_optimized',
        },
        user_id: userId,
      })
      .select()
      .single();

    if (jobErr) return errorResponse(jobErr.message, 500);

    // Link VPS job to build
    await supabase
      .from('pageforge_builds')
      .update({ vps_job_id: job.id })
      .eq('id', build.id);

    return successResponse({ run_id: build.id, job_id: job.id, template_name: template.name, is_pageforge: true }, 201);
  }

  // Create the team run
  const { data: run, error: runErr } = await supabase
    .from('agent_team_runs')
    .insert({
      template_id: body.template_id,
      config: body.config || {},
      input_data: body.input_data,
      client_id: body.client_id || null,
      site_config_id: body.site_config_id || null,
      status: 'pending',
      created_by: userId,
    })
    .select()
    .single();

  if (runErr) return errorResponse(runErr.message, 500);

  // Create VPS job to trigger execution
  const { data: job, error: jobErr } = await supabase
    .from('vps_jobs')
    .insert({
      job_type: 'agent_team',
      status: 'pending',
      user_id: userId,
      client_id: body.client_id || null,
      payload: {
        team_run_id: run.id,
        template_slug: template.slug,
        site_config_id: body.site_config_id || null,
      },
    })
    .select()
    .single();

  if (jobErr) return errorResponse(jobErr.message, 500);

  // Link the VPS job to the run
  await supabase
    .from('agent_team_runs')
    .update({ vps_job_id: job.id })
    .eq('id', run.id);

  return successResponse({ run_id: run.id, job_id: job.id, template_name: template.name }, 201);
}
