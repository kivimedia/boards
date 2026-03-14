import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * POST /api/team-pr/drafts/batch-approve
 * Approve multiple email drafts at once.
 * Body: { ids: string[] }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{ ids: string[] }>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { ids } = body.body;

  if (!ids?.length) return errorResponse('ids array required', 400);

  const now = new Date().toISOString();
  let approved = 0;

  for (const id of ids) {
    // Verify ownership via run
    const { data: draft, error: draftError } = await supabase
      .from('pr_email_drafts')
      .select('id, outlet_id, run_id, status, run:pr_runs!inner(id, user_id)')
      .eq('id', id)
      .eq('run.user_id', userId)
      .single();

    if (draftError || !draft || draft.status !== 'DRAFT') continue;

    // Set draft to APPROVED
    await supabase
      .from('pr_email_drafts')
      .update({ status: 'APPROVED', updated_at: now })
      .eq('id', id);

    // Update outlet pipeline_stage
    if (draft.outlet_id) {
      await supabase
        .from('pr_outlets')
        .update({ pipeline_stage: 'EMAIL_APPROVED', updated_at: now })
        .eq('id', draft.outlet_id);
    }

    approved++;
  }

  // Increment emails_approved on affected runs
  if (approved > 0) {
    const runIds = [...new Set(ids)];
    // Get distinct run_ids from the approved drafts
    const { data: drafts } = await supabase
      .from('pr_email_drafts')
      .select('run_id')
      .in('id', ids)
      .eq('status', 'APPROVED');

    const uniqueRunIds = [...new Set((drafts || []).map(d => d.run_id))];
    for (const runId of uniqueRunIds) {
      const count = (drafts || []).filter(d => d.run_id === runId).length;
      const { data: run } = await supabase
        .from('pr_runs')
        .select('emails_approved')
        .eq('id', runId)
        .single();

      if (run) {
        await supabase
          .from('pr_runs')
          .update({ emails_approved: (run.emails_approved || 0) + count, updated_at: now })
          .eq('id', runId);
      }
    }
  }

  return successResponse({ approved });
}
