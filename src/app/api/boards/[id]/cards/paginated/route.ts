import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { paginateCards } from '@/lib/performance';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/cards/paginated
 * Cursor-based paginated card list for a board.
 * Query params: cursor, limit (default 50, max 200), list_id, direction (forward|backward)
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: boardId } = params;
  const { searchParams } = new URL(request.url);

  const cursor = searchParams.get('cursor') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
  const listId = searchParams.get('list_id') || undefined;
  const direction = (searchParams.get('direction') || 'forward') as 'forward' | 'backward';

  try {
    const result = await paginateCards(supabase, boardId, listId, {
      cursor,
      limit,
      direction,
    });

    return successResponse(result);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to paginate cards',
      500
    );
  }
}
