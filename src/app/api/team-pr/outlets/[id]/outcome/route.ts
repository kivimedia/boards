import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

type OutcomeValue = 'no_response' | 'positive' | 'neutral' | 'negative';

const VALID_OUTCOMES: OutcomeValue[] = ['no_response', 'positive', 'neutral', 'negative'];

/**
 * POST /api/team-pr/outlets/[id]/outcome
 * Record the real-world outcome for an outlet (did coverage happen?).
 * Body: { outcome: 'no_response'|'positive'|'neutral'|'negative', notes?: string }
 * Side effect: inserts a pr_feedback record reflecting the outcome.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    outcome: OutcomeValue;
    notes?: string;
  }>(request);
  if (!body.ok) return body.response;

  const { outcome, notes } = body.body;

  if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
    return errorResponse(
      `outcome is required and must be one of: ${VALID_OUTCOMES.join(', ')}`
    );
  }

  const { supabase, userId } = auth.ctx;
  const { id } = params;

  // Verify ownership via run
  const { data: outlet, error: checkError } = await supabase
    .from('pr_outlets')
    .select('id, client_id, run_id, run:pr_runs!inner(user_id)')
    .eq('id', id)
    .eq('run.user_id', userId)
    .single();

  if (checkError || !outlet) return errorResponse('Outlet not found', 404);

  // Update outlet with outcome fields
  const { data: updatedOutlet, error: updateError } = await supabase
    .from('pr_outlets')
    .update({
      outcome,
      outcome_notes: notes ?? null,
      outcome_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) return errorResponse(updateError.message, 500);

  // Insert feedback record reflecting this outcome
  const feedbackType = outcome === 'negative' ? 'quality_issue' : 'good_match';
  const feedbackText = `Outcome: ${outcome}${notes ? ` - ${notes}` : ''}`;

  const { error: feedbackError } = await supabase.from('pr_feedback').insert({
    user_id: userId,
    client_id: outlet.client_id,
    run_id: outlet.run_id ?? null,
    outlet_id: id,
    feedback_type: feedbackType,
    feedback_text: feedbackText,
    sentiment: outcome === 'positive' ? 'positive' : outcome === 'negative' ? 'negative' : 'neutral',
    applied_to_future_runs: false,
  });

  if (feedbackError) {
    // Non-fatal: outcome was saved, log and continue
    console.error('[outcome] feedback insert failed:', feedbackError.message);
  }

  return successResponse(updatedOutlet);
}
