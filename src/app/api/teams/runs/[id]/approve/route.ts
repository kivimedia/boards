import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/teams/runs/[id]/approve - Submit gate decision for a team run
 *
 * Body: {
 *   gate_name: string;       // e.g. "gate1"
 *   decision: 'approve' | 'revise' | 'scrap';
 *   feedback?: string;
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id: runId } = await params;

  let body: { gate_name: string; decision: string; feedback?: string };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.gate_name || !body.decision) {
    return errorResponse('gate_name and decision are required', 400);
  }

  if (!['approve', 'revise', 'scrap'].includes(body.decision)) {
    return errorResponse('decision must be approve, revise, or scrap', 400);
  }

  // Load the run
  const { data: run, error: runErr } = await supabase
    .from('agent_team_runs')
    .select('id, status, gate_decisions, template:agent_team_templates(phases)')
    .eq('id', runId)
    .single();

  if (runErr || !run) return errorResponse('Run not found', 404);

  // Verify the run is waiting at this gate
  if (!run.status?.startsWith('awaiting_')) {
    return errorResponse(`Run is not at a gate (status: ${run.status})`, 400);
  }

  // Update gate decisions
  const gateDecisions = { ...(run.gate_decisions as Record<string, unknown> || {}) };
  gateDecisions[body.gate_name] = {
    decision: body.decision,
    feedback: body.feedback || null,
    decided_at: new Date().toISOString(),
    decided_by: userId,
  };

  // Find the VPS job for this run to set the decision
  const { data: vpsJob } = await supabase
    .from('vps_jobs')
    .select('id')
    .eq('job_type', 'agent_team')
    .filter('payload->>team_run_id', 'eq', runId)
    .single();

  if (body.decision === 'approve') {
    // Find next phase after the gate
    const phases = (run.template as any)?.phases as any[] || [];
    const gateIndex = phases.findIndex((p: any) => p.name === body.gate_name);
    const nextPhaseIndex = gateIndex + 1;

    if (nextPhaseIndex >= phases.length) {
      // Last gate approved - mark as completed
      await supabase
        .from('agent_team_runs')
        .update({
          status: 'completed',
          gate_decisions: gateDecisions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);

      if (vpsJob) {
        await supabase
          .from('vps_jobs')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', vpsJob.id);
      }
    } else {
      // Resume from next phase
      await supabase
        .from('agent_team_runs')
        .update({
          gate_decisions: gateDecisions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);

      // Create new VPS job to resume
      await supabase
        .from('vps_jobs')
        .insert({
          job_type: 'agent_team',
          status: 'pending',
          user_id: userId,
          payload: {
            team_run_id: runId,
            resume_from_phase: nextPhaseIndex,
          },
        });
    }
  } else if (body.decision === 'revise') {
    // Send back to an earlier phase (the phase before the gate)
    const phases = (run.template as any)?.phases as any[] || [];
    const gateIndex = phases.findIndex((p: any) => p.name === body.gate_name);
    // Find the last non-gate phase before this gate
    let reviseIndex = gateIndex - 1;
    while (reviseIndex >= 0 && phases[reviseIndex].is_gate) reviseIndex--;
    if (reviseIndex < 0) reviseIndex = 0;

    await supabase
      .from('agent_team_runs')
      .update({
        gate_decisions: gateDecisions,
        status: phases[reviseIndex]?.name || 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);

    // Create new VPS job to re-run from earlier phase
    await supabase
      .from('vps_jobs')
      .insert({
        job_type: 'agent_team',
        status: 'pending',
        user_id: userId,
        payload: {
          team_run_id: runId,
          resume_from_phase: reviseIndex,
        },
      });
  } else if (body.decision === 'scrap') {
    await supabase
      .from('agent_team_runs')
      .update({
        status: 'scrapped',
        gate_decisions: gateDecisions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);

    if (vpsJob) {
      await supabase
        .from('vps_jobs')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', vpsJob.id);
    }
  }

  return successResponse({ run_id: runId, gate: body.gate_name, decision: body.decision });
}
