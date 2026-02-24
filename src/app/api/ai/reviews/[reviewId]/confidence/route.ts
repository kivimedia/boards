import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { setReviewConfidence, verifyReviewAccuracy } from '@/lib/enterprise';

interface Params {
  params: { reviewId: string };
}

interface SetConfidenceBody {
  confidence_score: number;
}

/**
 * PATCH /api/ai/reviews/[reviewId]/confidence
 * Set the confidence score for an AI review.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<SetConfidenceBody>(request);
  if (!parsed.ok) return parsed.response;

  const { confidence_score } = parsed.body;

  if (typeof confidence_score !== 'number') return errorResponse('confidence_score must be a number');
  if (confidence_score < 0 || confidence_score > 1) return errorResponse('confidence_score must be between 0 and 1');

  const { supabase } = auth.ctx;
  const { reviewId } = params;

  await setReviewConfidence(supabase, reviewId, confidence_score);
  return successResponse({ id: reviewId, confidence_score });
}

interface VerifyAccuracyBody {
  is_accurate: boolean;
}

/**
 * POST /api/ai/reviews/[reviewId]/confidence
 * Verify the accuracy of an AI review.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<VerifyAccuracyBody>(request);
  if (!parsed.ok) return parsed.response;

  const { is_accurate } = parsed.body;

  if (typeof is_accurate !== 'boolean') return errorResponse('is_accurate must be a boolean');

  const { supabase, userId } = auth.ctx;
  const { reviewId } = params;

  await verifyReviewAccuracy(supabase, reviewId, userId, is_accurate);
  return successResponse({ id: reviewId, accuracy_verified: is_accurate, accuracy_verified_by: userId });
}
