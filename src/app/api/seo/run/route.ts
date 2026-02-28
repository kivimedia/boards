import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface StartRunBody {
  team_config_id: string;
  topic: string;
  silo?: string;
  assignment?: Record<string, unknown>;
}

/**
 * POST /api/seo/run
 * Start a new SEO pipeline run.
 * Creates a vps_jobs entry (job_type='pipeline:seo') and a linked seo_pipeline_runs entry.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<StartRunBody>(request);
  if (!body.ok) return body.response;

  const { team_config_id, topic, silo, assignment } = body.body;

  if (!team_config_id?.trim()) return errorResponse('team_config_id is required');
  if (!topic?.trim()) return errorResponse('topic is required');

  const { supabase, userId } = auth.ctx;

  // Verify the team config exists and get its client_id
  const { data: configCheck, error: configErr } = await supabase
    .from('seo_team_configs')
    .select('id, client_id')
    .eq('id', team_config_id)
    .single();

  if (configErr || !configCheck) {
    return errorResponse('Team config not found', 404);
  }

  // Create the VPS job entry
  const { data: job, error: jobErr } = await supabase
    .from('vps_jobs')
    .insert({
      job_type: 'pipeline:seo',
      status: 'pending',
      user_id: userId,
      client_id: configCheck.client_id || null,
      payload: { team_config_id, topic, silo: silo || null },
    })
    .select()
    .single();

  if (jobErr) return errorResponse(jobErr.message, 500);

  // Create the SEO pipeline run linked to the job
  const { data: run, error: runErr } = await supabase
    .from('seo_pipeline_runs')
    .insert({
      vps_job_id: job.id,
      team_config_id: team_config_id.trim(),
      client_id: configCheck.client_id || null,
      topic: topic.trim(),
      silo: silo?.trim() || null,
      assignment: assignment || null,
      status: 'pending',
    })
    .select()
    .single();

  if (runErr) return errorResponse(runErr.message, 500);

  return successResponse({ run, job_id: job.id }, 201);
}
