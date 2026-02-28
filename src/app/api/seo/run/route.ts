import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createPipelineRun } from '@/lib/seo/create-pipeline-run';

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

  try {
    const { run, jobId } = await createPipelineRun(supabase, {
      userId,
      teamConfigId: team_config_id.trim(),
      clientId: configCheck.client_id || null,
      topic: topic.trim(),
      silo: silo?.trim() || null,
      assignment: assignment || null,
    });
    return successResponse({ run, job_id: jobId }, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create run', 500);
  }
}
