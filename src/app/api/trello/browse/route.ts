import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import {
  getTrelloCredentials,
  browseTrelloBoards,
  browseTrelloLists,
  browseTrelloCards,
} from '@/lib/trello-browse';

/**
 * GET /api/trello/browse
 * Browse Trello boards, lists, and cards using saved credentials.
 *
 * Query params:
 *   (none)          → returns boards
 *   ?board_id=xxx   → returns lists for that board
 *   ?list_id=xxx    → returns cards for that list
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const creds = await getTrelloCredentials(auth.ctx.supabase);
  if (!creds) {
    return errorResponse(
      'No Trello credentials found. Please run a Trello migration first to save your API key and token.',
      400
    );
  }

  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get('board_id');
  const listId = searchParams.get('list_id');

  try {
    if (listId) {
      const cards = await browseTrelloCards(creds, listId);
      return successResponse(cards);
    }
    if (boardId) {
      const lists = await browseTrelloLists(creds, boardId);
      return successResponse(lists);
    }
    const boards = await browseTrelloBoards(creds);
    return successResponse(boards);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to browse Trello',
      500
    );
  }
}
