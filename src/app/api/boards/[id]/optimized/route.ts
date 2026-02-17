import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { loadBoardWithAllData } from '@/lib/performance';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/optimized
 * Load full board data with N+1 fix — single batch query per relation.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: boardId } = params;

  try {
    const data = await loadBoardWithAllData(supabase, boardId);

    if (!data.board) {
      return errorResponse('Board not found', 404);
    }

    return successResponse(data);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to load board data',
      500
    );
  }
}
