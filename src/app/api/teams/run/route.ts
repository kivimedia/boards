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
