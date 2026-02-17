import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { fetchTrelloBoards } from '@/lib/trello-migration';

interface FetchBoardsBody {
  trello_api_key: string;
  trello_token: string;
}

/**
 * POST /api/migration/trello/boards
 * Fetch Trello boards using provided credentials.
 * Body: { trello_api_key, trello_token }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<FetchBoardsBody>(request);
  if (!body.ok) return body.response;

  const { trello_api_key, trello_token } = body.body;

  if (!trello_api_key?.trim()) return errorResponse('trello_api_key is required');
  if (!trello_token?.trim()) return errorResponse('trello_token is required');

  try {
    const boards = await fetchTrelloBoards({
      key: trello_api_key.trim(),
      token: trello_token.trim(),
    });

    return successResponse(boards);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Trello boards';
    return errorResponse(message, 502);
  }
}
