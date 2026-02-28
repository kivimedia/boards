import { SupabaseClient } from '@supabase/supabase-js';

export async function createPipelineRun(
  supabase: SupabaseClient,
  params: {
    userId: string;
    teamConfigId: string;
    clientId: string | null;
    topic: string;
    silo: string | null;
    assignment?: Record<string, unknown> | null;
  }
): Promise<{ run: Record<string, unknown>; jobId: string }> {
  const { userId, teamConfigId, clientId, topic, silo, assignment } = params;

  // Create the VPS job entry
  const { data: job, error: jobErr } = await supabase
    .from('vps_jobs')
    .insert({
      job_type: 'pipeline:seo',
      status: 'pending',
      user_id: userId,
      client_id: clientId,
      payload: {
        team_config_id: teamConfigId,
        topic,
        silo: silo || null,
        ...(assignment ? { assignment } : {}),
      },
    })
    .select()
    .single();

  if (jobErr || !job) throw new Error(jobErr?.message || 'Failed to create VPS job');

  // Create the SEO pipeline run linked to the job
  const { data: run, error: runErr } = await supabase
    .from('seo_pipeline_runs')
    .insert({
      vps_job_id: job.id,
      team_config_id: teamConfigId,
      client_id: clientId,
      topic,
      silo: silo || null,
      assignment: assignment || null,
      status: 'pending',
    })
    .select()
    .single();

  if (runErr || !run) throw new Error(runErr?.message || 'Failed to create pipeline run');

  // Update job payload with the pipeline_run_id so the VPS worker can find it
  await supabase
    .from('vps_jobs')
    .update({ payload: { ...job.payload, pipeline_run_id: run.id } })
    .eq('id', job.id);

  return { run, jobId: job.id };
}
