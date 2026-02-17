import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getCostSummary } from '@/lib/ai/cost-profiling';

/**
 * GET /api/ai/cost-summary
 * Get AI cost summary with date range filters.
 * Query params:
 *   startDate: string (required) - ISO date string e.g. 2026-01-01
 *   endDate: string (required) - ISO date string e.g. 2026-01-31
 *   userId?: string - filter by user
 *   boardId?: string - filter by board
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const userId = searchParams.get('userId') ?? undefined;
  const boardId = searchParams.get('boardId') ?? undefined;

  if (!startDate) return errorResponse('startDate query parameter is required');
  if (!endDate) return errorResponse('endDate query parameter is required');

  try {
    const summary = await getCostSummary(supabase, {
      startDate,
      endDate,
      userId,
      boardId,
    });
    return successResponse(summary);
  } catch (err) {
    return errorResponse(
      `Failed to fetch cost summary: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
