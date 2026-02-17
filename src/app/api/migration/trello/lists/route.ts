import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { fetchTrelloLists } from '@/lib/trello-migration';

interface FetchListsBody {
  trello_api_key: string;
  trello_token: string;
  board_ids: string[];
}

/**
 * POST /api/migration/trello/lists
 * Fetch Trello lists for the given boards, grouped by board ID.
 * Body: { trello_api_key, trello_token, board_ids }
 * Returns: { data: Record<boardId, TrelloList[]> }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<FetchListsBody>(request);
  if (!body.ok) return body.response;

  const { trello_api_key, trello_token, board_ids } = body.body;

  if (!trello_api_key?.trim()) return errorResponse('trello_api_key is required');
  if (!trello_token?.trim()) return errorResponse('trello_token is required');
  if (!Array.isArray(board_ids) || board_ids.length === 0) return errorResponse('board_ids is required');

  try {
    const trelloAuth = {
      key: trello_api_key.trim(),
      token: trello_token.trim(),
    };

    const result: Record<string, { id: string; name: string; closed: boolean }[]> = {};

    for (const boardId of board_ids) {
      const lists = await fetchTrelloLists(trelloAuth, boardId);
      // Only return open lists
      result[boardId] = lists
        .filter((l) => !l.closed)
        .map((l) => ({ id: l.id, name: l.name, closed: l.closed }));
    }

    return successResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Trello lists';
    return errorResponse(message, 502);
  }
}
