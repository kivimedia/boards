import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * POST /api/pageforge/builds/[id]/retry
 * Retry a failed build by resetting status and creating a new VPS job
 * to resume from the failed phase.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const resumeFromPhase = typeof body.resume_from_phase === 'number' ? body.resume_from_phase : 0;

  // Fetch the build
  const { data: build, error } = await auth.ctx.supabase
    .from('pageforge_builds')
    .select('id, status, site_profile_id, figma_file_key, page_title, current_phase')
    .eq('id', params.id)
    .single();

  if (error || !build) {
    return errorResponse('Build not found', 404);
  }

  // Only allow retry on failed or cancelled builds
  if (build.status !== 'failed' && build.status !== 'cancelled') {
    return errorResponse('Build is not in a retryable state', 400);
  }

  // Create a new VPS job to resume from the failed phase
  const { data: vpsJob, error: jobError } = await auth.ctx.supabase
    .from('vps_jobs')
    .insert({
      job_type: 'pipeline:pageforge',
      status: 'pending',
      user_id: auth.ctx.userId,
      payload: {
        build_id: build.id,
        resume_from_phase: resumeFromPhase,
      },
    })
    .select('id')
    .single();

  if (jobError || !vpsJob) {
    return errorResponse('Failed to create VPS job: ' + (jobError?.message || 'Unknown'), 500);
  }

  // Reset build status to the phase it will resume from
  const PHASE_ORDER = [
    'preflight', 'figma_analysis', 'section_classification', 'markup_generation',
    'markup_validation', 'deploy_draft', 'image_optimization', 'vqa_capture',
    'vqa_comparison', 'vqa_fix_loop', 'functional_qa', 'seo_config',
    'report_generation', 'developer_review_gate', 'am_signoff_gate',
  ];
  const resumeStatus = PHASE_ORDER[resumeFromPhase] || 'pending';

  await auth.ctx.supabase
    .from('pageforge_builds')
    .update({
      status: resumeStatus,
      current_phase: resumeFromPhase,
      vps_job_id: vpsJob.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  // Post a chat message about the retry
  await auth.ctx.supabase
    .from('pageforge_build_messages')
    .insert({
      build_id: build.id,
      role: 'system',
      sender_name: 'System',
      content: `Build retry requested. Resuming from phase ${resumeFromPhase + 1}/15: ${resumeStatus.replace(/_/g, ' ')}`,
      phase: resumeStatus,
      phase_index: resumeFromPhase,
    });

  return NextResponse.json({
    success: true,
    vps_job_id: vpsJob.id,
    resume_from_phase: resumeFromPhase,
  });
}
