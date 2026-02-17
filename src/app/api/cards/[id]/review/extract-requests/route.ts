import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { extractChangeRequests } from '@/lib/ai/design-review';

interface Params {
  params: { id: string };
}

/**
 * POST /api/cards/[id]/review/extract-requests
 * Extract change requests from card comments.
 * Useful for previewing what the AI will evaluate before running a full review.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  // Fetch all comments for the card
  const { data: comments, error } = await supabase
    .from('comments')
    .select('content, created_at')
    .eq('card_id', cardId)
    .order('created_at', { ascending: true });

  if (error) {
    return errorResponse(`Failed to fetch comments: ${error.message}`, 500);
  }

  if (!comments || comments.length === 0) {
    return successResponse({
      changeRequests: [],
      commentCount: 0,
      message: 'No comments found on this card.',
    });
  }

  const changeRequests = extractChangeRequests(comments);

  return successResponse({
    changeRequests,
    commentCount: comments.length,
    message:
      changeRequests.length > 0
        ? `Extracted ${changeRequests.length} change request(s) from ${comments.length} comment(s).`
        : 'No actionable change requests found in comments. Try adding comments with numbered or bulleted feedback.',
  });
}
