import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { transitionStage, isValidTransition } from '@/lib/outreach/pipeline-fsm';
import type { LIPipelineStage } from '@/lib/types';

/**
 * GET /api/outreach/leads/[id] - Get lead detail
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  // Fetch lead
  const { data: lead, error } = await supabase
    .from('li_leads')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !lead) return errorResponse('Lead not found', 404);

  // Fetch pipeline events
  const { data: events } = await supabase
    .from('li_pipeline_events')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: true });

  // Fetch outreach messages
  const { data: messages } = await supabase
    .from('li_outreach_messages')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: true });

  // Fetch overrides
  const { data: overrides } = await supabase
    .from('li_qualification_overrides')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: true });

  // Fetch cost events
  const { data: costs } = await supabase
    .from('li_cost_events')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: true });

  return successResponse({
    lead,
    events: events || [],
    messages: messages || [],
    overrides: overrides || [],
    costs: costs || [],
  });
}

/**
 * PATCH /api/outreach/leads/[id] - Update lead
 *
 * Body can include:
 *   - Basic fields: notes, email, website, job_position, company_name, etc.
 *   - pipeline_stage: triggers stage transition with validation
 *   - qualification_override: { new_decision, reason } - logs to overrides table
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  // Fetch current lead
  const { data: lead, error: fetchError } = await supabase
    .from('li_leads')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !lead) return errorResponse('Lead not found', 404);

  // Handle pipeline stage transition
  if (body.pipeline_stage && body.pipeline_stage !== lead.pipeline_stage) {
    const fromStage = lead.pipeline_stage as LIPipelineStage;
    const toStage = body.pipeline_stage as LIPipelineStage;

    const result = await transitionStage(supabase, id, fromStage, toStage, 'manual', body.transition_notes as string);
    if (!result.success) {
      return errorResponse(result.error || 'Invalid stage transition', 400);
    }

    // Remove from body so we don't double-update
    delete body.pipeline_stage;
    delete body.transition_notes;
  }

  // Handle qualification override
  if (body.qualification_override) {
    const override = body.qualification_override as { new_decision: string; reason: string };

    await supabase.from('li_qualification_overrides').insert({
      user_id: userId,
      lead_id: id,
      original_decision: lead.qualification_status,
      new_decision: override.new_decision,
      reason: override.reason,
    });

    // Update the lead's qualification status
    body.qualification_status = override.new_decision;
    delete body.qualification_override;
  }

  // Filter to allowed update fields
  const allowedFields = [
    'notes', 'email', 'website', 'job_position', 'company_name',
    'company_url', 'country', 'city', 'state', 'connections_count',
    'connection_degree', 'qualification_status', 'loom_consent',
    'loom_response_positive', 'session_attended',
  ];

  const updateData: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  if (Object.keys(updateData).length > 0) {
    const { error: updateError } = await supabase
      .from('li_leads')
      .update(updateData)
      .eq('id', id);

    if (updateError) return errorResponse(updateError.message, 500);
  }

  return successResponse({ updated: true });
}

/**
 * DELETE /api/outreach/leads/[id] - Soft-delete a lead
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  const now = new Date();
  const purgeDate = new Date(now);
  purgeDate.setDate(purgeDate.getDate() + 30);

  const { error } = await supabase
    .from('li_leads')
    .update({
      deleted_at: now.toISOString(),
      purge_after: purgeDate.toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return errorResponse(error.message, 500);

  return successResponse({ deleted: true });
}
