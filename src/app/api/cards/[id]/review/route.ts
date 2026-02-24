import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import {
  extractChangeRequests,
  runDesignReview,
  storeReviewResult,
  getCardReviewHistory,
} from '@/lib/ai/design-review';
import type { AIChangeRequest } from '@/lib/types';

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/[id]/review
 * Get the review history for a card.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  try {
    const history = await getCardReviewHistory(supabase, cardId);
    return successResponse(history);
  } catch (err) {
    return errorResponse(
      `Failed to fetch review history: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface RunReviewBody {
  attachmentId: string;
  previousAttachmentId?: string;
  changeRequests?: AIChangeRequest[];
  briefSummary?: string;
}

/**
 * POST /api/cards/[id]/review
 * Run a new AI design review for a card.
 *
 * Body:
 *   attachmentId: string (required) - The attachment to review
 *   previousAttachmentId?: string - Previous version for comparison
 *   changeRequests?: AIChangeRequest[] - If not provided, extracted from card comments
 *   briefSummary?: string - If not provided, fetched from card_briefs table
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<RunReviewBody>(request);
  if (!body.ok) return body.response;

  const { attachmentId, previousAttachmentId, changeRequests: providedChangeRequests, briefSummary: providedBriefSummary } = body.body;
  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  if (!attachmentId) {
    return errorResponse('attachmentId is required');
  }

  try {
    // Resolve change requests: use provided or extract from card comments
    let changeRequests: AIChangeRequest[];
    if (providedChangeRequests && providedChangeRequests.length > 0) {
      changeRequests = providedChangeRequests;
    } else {
      const { data: comments, error: commentsError } = await supabase
        .from('comments')
        .select('content, created_at')
        .eq('card_id', cardId)
        .order('created_at', { ascending: true });

      if (commentsError) {
        return errorResponse(`Failed to fetch card comments: ${commentsError.message}`, 500);
      }

      changeRequests = extractChangeRequests(comments ?? []);

      if (changeRequests.length === 0) {
        return errorResponse(
          'No change requests found. Add comments with review feedback to the card, or provide changeRequests in the request body.',
          422
        );
      }
    }

    // Resolve brief summary: use provided or fetch from card_briefs
    let briefSummary: string;
    if (providedBriefSummary) {
      briefSummary = providedBriefSummary;
    } else {
      const { data: brief } = await supabase
        .from('card_briefs')
        .select('data')
        .eq('card_id', cardId)
        .single();

      if (brief?.data && typeof brief.data === 'object') {
        // Serialize the brief data fields into a readable summary
        const entries = Object.entries(brief.data as Record<string, unknown>)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([key, value]) => `${key}: ${String(value)}`);
        briefSummary = entries.length > 0
          ? entries.join('\n')
          : 'No brief details available.';
      } else {
        briefSummary = 'No brief available for this card.';
      }
    }

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

    // Run the AI design review
    const output = await runDesignReview(supabase, {
      cardId,
      boardId,
      userId,
      attachmentId,
      previousAttachmentId,
      changeRequests,
      briefSummary,
    });

    // Store the result
    const stored = await storeReviewResult(
      supabase,
      {
        cardId,
        boardId,
        userId,
        attachmentId,
        previousAttachmentId,
        changeRequests,
        briefSummary,
      },
      output
    );

    if (!stored) {
      // Review ran successfully but storage failed — return the output anyway
      return successResponse(
        { ...output, _warning: 'Review completed but failed to persist to database.' },
        201
      );
    }

    return successResponse(stored, 201);
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

    return errorResponse(`Design review failed: ${message}`, 500);
  }
}
