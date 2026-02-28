import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * POST /api/pageforge/builds/[id]/revise
 * Request a revision with feedback (alternative to gate endpoint).
 * Body: { feedback: string, restartFrom?: string }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { feedback, restartFrom } = body;

  if (!feedback) {
    return errorResponse('feedback is required');
  }

  const { data: build, error } = await auth.ctx.supabase
    .from('pageforge_builds')
    .select('status')
    .eq('id', params.id)
    .single();

  if (error || !build) {
    return errorResponse('Build not found', 404);
  }

  // Update build to revise state
  const targetPhase = restartFrom || 'markup_generation';
  const { PAGEFORGE_PHASE_ORDER } = await import('@/lib/ai/pageforge-pipeline');
  const phaseIndex = PAGEFORGE_PHASE_ORDER.indexOf(targetPhase);

  if (phaseIndex < 0) {
    return errorResponse(`Invalid phase: ${targetPhase}`);
  }

  await auth.ctx.supabase
    .from('pageforge_builds')
    .update({
      status: targetPhase,
      current_phase: phaseIndex,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  // Re-enqueue the VPS job
  await auth.ctx.supabase.from('vps_jobs').insert({
    job_type: 'pipeline:pageforge',
    status: 'queued',
    payload: {
      build_id: params.id,
      resume_from_phase: phaseIndex,
      revision_feedback: feedback,
    },
    created_by: auth.ctx.userId,
  });

  return NextResponse.json({ status: targetPhase, phaseIndex });
}
