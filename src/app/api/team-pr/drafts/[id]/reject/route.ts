import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * POST /api/team-pr/drafts/[id]/reject
 * Reject email draft with notes.
 * Body: { reviewer_notes: string }. Sets status='REJECTED'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    reviewer_notes: string;
  }>(request);
  if (!body.ok) return body.response;

  if (!body.body.reviewer_notes?.trim()) {
    return errorResponse('reviewer_notes is required');
  }

  const { supabase, userId } = auth.ctx;
  const { id } = params;

  // Verify ownership via run and fetch FK fields for feedback logging
  const { data: draft, error: checkError } = await supabase
    .from('pr_email_drafts')
    .select('id, outlet_id, run_id, client_id, run:pr_runs!inner(user_id)')
    .eq('id', id)
    .eq('run.user_id', userId)
    .single();

  if (checkError || !draft) return errorResponse('Draft not found', 404);

  const reviewerNotes = body.body.reviewer_notes.trim();

  const { data, error } = await supabase
    .from('pr_email_drafts')
    .update({
      status: 'REJECTED',
      reviewer_notes: reviewerNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  // Auto-log feedback for human override action
  await supabase.from('pr_feedback').insert({
    client_id: draft.client_id,
    run_id: draft.run_id,
    outlet_id: draft.outlet_id ?? null,
    feedback_type: 'draft_override',
    feedback_text: reviewerNotes
      ? `Draft rejected by team: ${reviewerNotes}`
      : 'Draft rejected by team',
    sentiment: 'negative',
    applied_to_future_runs: false,
  });

  return successResponse(data);
}
