import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { runVideoReview } from '@/lib/ai/video-review';
import { extractChangeRequests } from '@/lib/ai/design-review';

interface Params {
  params: { id: string };
}

interface VideoReviewBody {
  currentVideoPath: string;
  previousVideoPath?: string;
  frameTimestamps?: number[];
}

/**
 * POST /api/cards/[id]/video-review
 * Run an AI video review for a card by extracting frames and comparing with Claude vision.
 *
 * Body:
 *   currentVideoPath: string (required) - Storage path to the current video
 *   previousVideoPath?: string - Storage path to the previous version for comparison
 *   frameTimestamps?: number[] - Specific timestamps to extract frames at
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<VideoReviewBody>(request);
  if (!body.ok) return body.response;

  const { currentVideoPath, previousVideoPath, frameTimestamps } = body.body;
  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  if (!currentVideoPath) {
    return errorResponse('currentVideoPath is required');
  }

  try {
    // Resolve board_id from card -> card_placements -> lists -> board
    const { data: placement, error: placementError } = await supabase
      .from('card_placements')
      .select('list:lists(board_id)')
      .eq('card_id', cardId)
      .limit(1)
      .single();

    if (placementError || !placement?.list) {
      return errorResponse('Could not determine board for this card', 500);
    }

    const boardId = (placement.list as unknown as { board_id: string }).board_id;

    // Get comments for change request extraction
    const { data: comments } = await supabase
      .from('comments')
      .select('content, created_at')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });

    const changeRequests = extractChangeRequests(comments ?? []);

    if (changeRequests.length === 0) {
      return errorResponse(
        'No change requests found in comments. Add revision feedback first.',
        422
      );
    }

    const result = await runVideoReview(supabase, {
      cardId,
      boardId,
      userId,
      currentVideoPath,
      previousVideoPath,
      changeRequests,
      frameTimestamps,
    });

    return successResponse(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Surface budget errors as 429
    if (message.includes('Budget exceeded')) {
      return errorResponse(message, 429);
    }

    // Surface configuration errors as 422
    if (message.includes('not configured') || message.includes('API key')) {
      return errorResponse(message, 422);
    }

    return errorResponse(`Video review failed: ${message}`, 500);
  }
}
