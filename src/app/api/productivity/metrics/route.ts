import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import {
  getProductivitySnapshots,
  aggregateSnapshots,
} from '@/lib/productivity-analytics';

/**
 * GET /api/productivity/metrics
 * Retrieve aggregated ProductivityMetrics for a date range.
 * Query params: start_date (required), end_date (required), user_id, board_id, department
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  if (!startDate || !endDate) {
    return errorResponse('start_date and end_date are required');
  }

  const userId = searchParams.get('user_id') ?? undefined;
  const boardId = searchParams.get('board_id') ?? undefined;
  const department = searchParams.get('department') ?? undefined;

  try {
    const snapshots = await getProductivitySnapshots(supabase, {
      startDate,
      endDate,
      userId,
      boardId,
      department,
    });

    const metrics = aggregateSnapshots(snapshots);
    return successResponse(metrics);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to compute metrics';
    return errorResponse(message, 500);
  }
}
