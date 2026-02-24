import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getRevisionMetrics } from '@/lib/revision-analysis';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/:id/revision-analysis/outliers
 * Return only the outlier cards for the given board.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  try {
    const outliers = await getRevisionMetrics(supabase, boardId, true);
    return successResponse(outliers);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch outlier metrics';
    return errorResponse(message, 500);
  }
}
