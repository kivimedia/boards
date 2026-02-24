import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getClientBoards, linkClientBoard } from '@/lib/client-portal';

interface Params {
  params: { clientId: string };
}

/**
 * GET /api/clients/[clientId]/boards
 * Get all boards linked to a client.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const boards = await getClientBoards(supabase, params.clientId);
    return successResponse(boards);
  } catch (err) {
    return errorResponse(
      `Failed to fetch client boards: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface LinkBoardBody {
  boardId: string;
}

/**
 * POST /api/clients/[clientId]/boards
 * Link a board to a client for portal visibility.
 *
 * Body:
 *   boardId: string (required)
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<LinkBoardBody>(request);
  if (!body.ok) return body.response;

  const { boardId } = body.body;
  if (!boardId) {
    return errorResponse('boardId is required');
  }

  const { supabase } = auth.ctx;

  try {
    const linked = await linkClientBoard(supabase, params.clientId, boardId);
    if (!linked) {
      return errorResponse('Failed to link board to client', 500);
    }
    return successResponse(linked, 201);
  } catch (err) {
    return errorResponse(
      `Failed to link board: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
