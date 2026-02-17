import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { fetchTrelloBoardMembers } from '@/lib/trello-migration';
import type { TrelloMember } from '@/lib/types';

interface FetchMembersBody {
  trello_api_key: string;
  trello_token: string;
  board_ids: string[];
}

/**
 * POST /api/migration/trello/members
 * Fetch Trello board members for the given boards, deduplicated by ID.
 * Body: { trello_api_key, trello_token, board_ids }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<FetchMembersBody>(request);
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

    const allMembers: TrelloMember[] = [];
    const seenIds = new Set<string>();

    for (const boardId of board_ids) {
      const members = await fetchTrelloBoardMembers(trelloAuth, boardId);
      for (const member of members) {
        if (!seenIds.has(member.id)) {
          seenIds.add(member.id);
          allMembers.push(member);
        }
      }
    }

    return successResponse(allMembers);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Trello members';
    return errorResponse(message, 502);
  }
}
