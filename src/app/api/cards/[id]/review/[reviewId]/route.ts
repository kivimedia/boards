import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string; reviewId: string };
}

/**
 * GET /api/cards/[id]/review/[reviewId]
 * Get a single review result by ID.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: cardId, reviewId } = params;

  const { data, error } = await supabase
    .from('ai_review_results')
    .select('*')
    .eq('id', reviewId)
    .eq('card_id', cardId)
    .single();

  if (error || !data) {
    return errorResponse('Review result not found', 404);
  }

  return successResponse(data);
}

/**
 * DELETE /api/cards/[id]/review/[reviewId]
 * Delete a review result.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: cardId, reviewId } = params;

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

  const { error: deleteError } = await supabase
    .from('ai_review_results')
    .delete()
    .eq('id', reviewId)
    .eq('card_id', cardId);

  if (deleteError) {
    return errorResponse(`Failed to delete review: ${deleteError.message}`, 500);
  }

  return successResponse({ deleted: true });
}
