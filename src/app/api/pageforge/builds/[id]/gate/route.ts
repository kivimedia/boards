import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { submitPageForgeGateDecision } from '@/lib/ai/pageforge-pipeline';

interface Params {
  params: { id: string };
}

/**
 * POST /api/pageforge/builds/[id]/gate
 * Submit a gate decision (approve/revise/cancel).
 * Body: { gate: 'developer_review_gate' | 'am_signoff_gate', decision, feedback? }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { gate, decision, feedback } = body;

  if (!gate || !decision) {
    return errorResponse('gate and decision are required');
  }

  if (!['developer_review_gate', 'am_signoff_gate'].includes(gate)) {
    return errorResponse('gate must be developer_review_gate or am_signoff_gate');
  }

  if (!['approve', 'revise', 'cancel'].includes(decision)) {
    return errorResponse('decision must be approve, revise, or cancel');
  }

  try {
    const { newStatus } = await submitPageForgeGateDecision(
      auth.ctx.supabase,
      params.id,
      gate,
      decision,
      feedback || null,
      auth.ctx.userId
    );

    return NextResponse.json({ newStatus });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Gate decision failed', 400);
  }
}
