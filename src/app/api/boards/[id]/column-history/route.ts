import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getBoardColumnHistory } from '@/lib/productivity-analytics';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/column-history
 * Retrieve column move history for a board, with optional date range filtering.
 * Query params: start_date, end_date (ISO date strings)
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: boardId } = params;
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get('start_date') ?? undefined;
  const endDate = searchParams.get('end_date') ?? undefined;

  try {
    const history = await getBoardColumnHistory(supabase, boardId, startDate, endDate);
    return successResponse(history);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch board column history';
    return errorResponse(message, 500);
  }
}
