import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { overrideReviewVerdict } from '@/lib/ai/design-review';

interface Params {
  params: { id: string; reviewId: string };
}

const VALID_OVERRIDE_VERDICTS = ['overridden_approved', 'overridden_rejected'] as const;

interface OverrideBody {
  verdict: 'overridden_approved' | 'overridden_rejected';
  reason: string;
}

/**
 * POST /api/cards/[id]/review/[reviewId]/override
 * Override a review verdict (admin/lead action).
 *
 * Body:
 *   verdict: 'overridden_approved' | 'overridden_rejected'
 *   reason: string
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<OverrideBody>(request);
  if (!body.ok) return body.response;

  const { verdict, reason } = body.body;
  const { supabase, userId } = auth.ctx;
  const { id: cardId, reviewId } = params;

  // Validate verdict
  if (!verdict || !VALID_OVERRIDE_VERDICTS.includes(verdict)) {
    return errorResponse(
      `Invalid verdict. Must be one of: ${VALID_OVERRIDE_VERDICTS.join(', ')}`
    );
  }

  // Validate reason
  if (!reason?.trim()) {
    return errorResponse('A reason is required when overriding a review verdict');
  }

  // Verify the review exists and belongs to this card
  const { data: existing, error: fetchError } = await supabase
    .from('ai_review_results')
    .select('id')
    .eq('id', reviewId)
    .eq('card_id', cardId)
    .single();

  if (fetchError || !existing) {
    return errorResponse('Review result not found', 404);
  }

  // Perform the override
  const updated = await overrideReviewVerdict(
    supabase,
    reviewId,
    userId,
    verdict,
    reason.trim()
  );

  if (!updated) {
    return errorResponse('Failed to override review verdict', 500);
  }

  return successResponse(updated);
}
