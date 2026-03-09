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

  const baseJob = {
    job_type: 'seo',
    status: 'pending',
    user_id: userId,
    payload: {
      team_config_id: teamConfigId,
      topic,
      silo: silo || null,
      ...(assignment ? { assignment } : {}),
    },
  };

  // Create the VPS job entry.
  // Compatibility: some environments still have vps_jobs without client_id.
  let job: Record<string, unknown> | null = null;
  let jobErr: { message?: string } | null = null;

  const withClientResult = await supabase
    .from('vps_jobs')
    .insert({
      ...baseJob,
      client_id: clientId,
    })
    .select()
    .single();

  job = withClientResult.data as Record<string, unknown> | null;
  jobErr = withClientResult.error as { message?: string } | null;

  if (jobErr?.message?.includes("Could not find the 'client_id' column of 'vps_jobs'")) {
    const withoutClientResult = await supabase
      .from('vps_jobs')
      .insert(baseJob)
      .select()
      .single();
    job = withoutClientResult.data as Record<string, unknown> | null;
    jobErr = withoutClientResult.error as { message?: string } | null;
  }

  if (jobErr || !job) throw new Error(jobErr?.message || 'Failed to create VPS job');

  // Create the SEO pipeline run linked to the job.
  // Compatibility: some environments may also miss seo_pipeline_runs.client_id.
  let run: Record<string, unknown> | null = null;
  let runErr: { message?: string } | null = null;

  const runWithClientResult = await supabase
    .from('seo_pipeline_runs')
    .insert({
      vps_job_id: job.id as string,
      team_config_id: teamConfigId,
      client_id: clientId,
      topic,
      silo: silo || null,
      assignment: assignment || null,
      status: 'pending',
    })
    .select()
    .single();

  run = runWithClientResult.data as Record<string, unknown> | null;
  runErr = runWithClientResult.error as { message?: string } | null;

  if (runErr?.message?.includes("Could not find the 'client_id' column of 'seo_pipeline_runs'")) {
    const runWithoutClientResult = await supabase
      .from('seo_pipeline_runs')
      .insert({
        vps_job_id: job.id as string,
        team_config_id: teamConfigId,
        topic,
        silo: silo || null,
        assignment: assignment || null,
        status: 'pending',
      })
      .select()
      .single();
    run = runWithoutClientResult.data as Record<string, unknown> | null;
    runErr = runWithoutClientResult.error as { message?: string } | null;
  }

  if (runErr || !run) throw new Error(runErr?.message || 'Failed to create pipeline run');

  // Update job payload with the pipeline_run_id so the VPS worker can find it
  await supabase
    .from('vps_jobs')
    .update({ payload: { ...(job.payload as Record<string, unknown>), pipeline_run_id: run.id as string } })
    .eq('id', job.id as string);

  return { run, jobId: job.id as string };
}
