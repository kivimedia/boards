import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getReactions, addReaction, removeReaction, REACTION_EMOJIS } from '@/lib/comment-reactions';

interface Params {
  params: { id: string; commentId: string };
}

/**
 * GET /api/cards/[id]/comments/[commentId]/reactions
 * Fetch reactions for the comment.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const reactions = await getReactions(supabase, params.commentId);
    return successResponse(reactions);
  } catch (err) {
    return errorResponse(
      `Failed to fetch reactions: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface AddReactionBody {
  emoji: string;
}

/**
 * POST /api/cards/[id]/comments/[commentId]/reactions
 * Add a reaction to the comment.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<AddReactionBody>(request);
  if (!body.ok) return body.response;

  const { emoji } = body.body;

  if (!emoji || !(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
    return errorResponse(
      `Invalid emoji. Must be one of: ${REACTION_EMOJIS.join(', ')}`
    );
  }

  const { supabase, userId } = auth.ctx;

  try {
    await addReaction(supabase, params.commentId, userId, emoji);
    return successResponse(null, 201);
  } catch (err) {
    return errorResponse(
      `Failed to add reaction: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

/**
 * DELETE /api/cards/[id]/comments/[commentId]/reactions
 * Remove a reaction from the comment. Pass ?emoji=... as query param.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const emoji = searchParams.get('emoji');

  if (!emoji) {
    return errorResponse('emoji query parameter is required');
  }

  const { supabase, userId } = auth.ctx;

  try {
    await removeReaction(supabase, params.commentId, userId, emoji);
    return successResponse(null);
  } catch (err) {
    return errorResponse(
      `Failed to remove reaction: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
