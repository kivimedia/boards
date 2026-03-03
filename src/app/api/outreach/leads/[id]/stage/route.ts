import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { transitionStage } from '@/lib/outreach/pipeline-fsm';
import type { LIPipelineStage } from '@/lib/types';

/**
 * PATCH /api/outreach/leads/[id]/stage - Manual stage transition
 *
 * Body: {
 *   stage: LIPipelineStage;
 *   notes?: string;
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  let body: { stage: LIPipelineStage; notes?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.stage) {
    return errorResponse('stage is required', 400);
  }

  // Get current lead
  const { data: lead, error: leadError } = await supabase
    .from('li_leads')
    .select('pipeline_stage')
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (leadError || !lead) return errorResponse('Lead not found', 404);

  // Perform transition
  const result = await transitionStage(
    supabase,
    id,
    lead.pipeline_stage as LIPipelineStage,
    body.stage,
    'manual',
    body.notes
  );

  if (!result.success) {
    return errorResponse(result.error || 'Transition failed', 400);
  }

  // Update last_contacted_at for outreach stages
  const contactStages = ['CONNECTION_SENT', 'MESSAGE_SENT', 'NUDGE_SENT', 'LOOM_SENT'];
  if (contactStages.includes(body.stage)) {
    await supabase
      .from('li_leads')
      .update({ last_contacted_at: new Date().toISOString() })
      .eq('id', id);
  }

  // Get updated lead
  const { data: updated } = await supabase
    .from('li_leads')
    .select('*')
    .eq('id', id)
    .single();

  return successResponse({ lead: updated });
}
