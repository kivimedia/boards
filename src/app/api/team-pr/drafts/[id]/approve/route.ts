import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/team-pr/drafts/[id]/approve
 * Approve email draft.
 * Sets status='APPROVED', updates linked outlet's pipeline_stage to 'EMAIL_APPROVED',
 * and increments the run's emails_approved count.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = params;

  // Fetch draft and verify ownership
  const { data: draft, error: draftError } = await supabase
    .from('pr_email_drafts')
    .select('id, outlet_id, run_id, run:pr_runs!inner(id, user_id, emails_approved)')
    .eq('id', id)
    .eq('run.user_id', userId)
    .single();

  if (draftError || !draft) return errorResponse('Draft not found', 404);

  const now = new Date().toISOString();

  // 1. Set draft status to APPROVED
  const { error: updateDraftError } = await supabase
    .from('pr_email_drafts')
    .update({ status: 'APPROVED', updated_at: now })
    .eq('id', id);

  if (updateDraftError) return errorResponse(updateDraftError.message, 500);

  // 2. Update linked outlet's pipeline_stage to EMAIL_APPROVED
  if (draft.outlet_id) {
    const { error: outletError } = await supabase
      .from('pr_outlets')
      .update({ pipeline_stage: 'EMAIL_APPROVED', updated_at: now })
      .eq('id', draft.outlet_id);

    if (outletError) return errorResponse(outletError.message, 500);
  }

  // 3. Increment run's emails_approved count
  const runData = Array.isArray(draft.run) ? draft.run[0] : draft.run;
  const currentCount = (runData as Record<string, unknown>)?.emails_approved as number || 0;
  const { error: runError } = await supabase
    .from('pr_runs')
    .update({ emails_approved: currentCount + 1, updated_at: now })
    .eq('id', draft.run_id);

  if (runError) return errorResponse(runError.message, 500);

  return successResponse({ approved: true, draft_id: id });
}
