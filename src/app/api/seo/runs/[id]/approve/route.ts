import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

type Params = { params: { id: string } };

interface ApproveBody {
  gate: 1 | 2;
  decision: 'approve' | 'revise' | 'scrap';
  feedback?: string;
}

/** Status progression when a gate is approved */
const GATE_NEXT_STATUS: Record<number, string> = {
  1: 'publishing',
  2: 'published',
};

/**
 * POST /api/seo/runs/[id]/approve
 * Submit a gate decision (approve, revise, or scrap) for an SEO pipeline run.
 * Body: { gate: 1 | 2, decision: 'approve' | 'revise' | 'scrap', feedback?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: Params
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<ApproveBody>(request);
  if (!body.ok) return body.response;

  const { gate, decision, feedback } = body.body;

  if (![1, 2].includes(gate)) {
    return errorResponse('gate must be 1 or 2');
  }
  if (!['approve', 'revise', 'scrap'].includes(decision)) {
    return errorResponse('decision must be "approve", "revise", or "scrap"');
  }

  const { supabase, userId } = auth.ctx;
  const { id } = params;

  // Verify the run exists
  const { data: run, error: runErr } = await supabase
    .from('seo_pipeline_runs')
    .select('id, status')
    .eq('id', id)
    .single();

  if (runErr || !run) {
    return errorResponse('Run not found', 404);
  }

  // Build the gate-specific update fields
  const gatePrefix = `gate${gate}`;
  const updates: Record<string, unknown> = {
    [`${gatePrefix}_decision`]: decision,
    [`${gatePrefix}_feedback`]: feedback || null,
    [`${gatePrefix}_decided_by`]: userId,
    [`${gatePrefix}_decided_at`]: new Date().toISOString(),
  };

  // Determine new status based on decision
  if (decision === 'approve') {
    updates.status = GATE_NEXT_STATUS[gate];
  } else if (decision === 'scrap') {
    updates.status = 'scrapped';
  } else if (decision === 'revise') {
    // Send back to writing (gate1) or visual_qa (gate2) for revision
    updates.status = gate === 1 ? 'writing' : 'visual_qa';
  }

  const { data: updated, error: updateErr } = await supabase
    .from('seo_pipeline_runs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateErr) return errorResponse(updateErr.message, 500);

  return successResponse(updated);
}
