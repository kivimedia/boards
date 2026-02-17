import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface MatchBoardsBody {
  trello_board_names: Record<string, string>; // trelloBoardId -> trelloBoardName
}

export interface BoardMatch {
  trello_board_id: string;
  trello_board_name: string;
  matched_board_id: string | null;
  matched_board_name: string | null;
}

/**
 * POST /api/migration/match-boards
 * For each Trello board, find an existing Agency Board board with the same name.
 * Returns match info so the wizard can show "merging into existing board X".
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<MatchBoardsBody>(request);
  if (!body.ok) return body.response;

  const { trello_board_names } = body.body;

  if (!trello_board_names || typeof trello_board_names !== 'object') {
    return errorResponse('trello_board_names is required');
  }

  try {
    const { supabase } = auth.ctx;

    // Fetch all boards from the database
    const { data: allBoards } = await supabase
      .from('boards')
      .select('id, name');

    const boardsByName = new Map<string, { id: string; name: string }>();
    for (const b of allBoards || []) {
      boardsByName.set(b.name.toLowerCase(), b);
    }

    const matches: BoardMatch[] = [];

    for (const [trelloId, trelloName] of Object.entries(trello_board_names)) {
      const exactMatch = boardsByName.get(trelloName.toLowerCase());
      const migratedMatch = boardsByName.get(`[migrated] ${trelloName.toLowerCase()}`);
      const match = exactMatch || migratedMatch;

      matches.push({
        trello_board_id: trelloId,
        trello_board_name: trelloName,
        matched_board_id: match?.id || null,
        matched_board_name: match?.name || null,
      });
    }

    return successResponse(matches);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to match boards';
    return errorResponse(message, 500);
  }
}
