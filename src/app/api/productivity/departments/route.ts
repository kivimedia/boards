import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getDepartmentRollup } from '@/lib/productivity-analytics';

/**
 * GET /api/productivity/departments
 * Get department-level productivity rollup.
 * Query params: start_date (required), end_date (required), compare (optional, 'previous')
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

  const comparePrevious = searchParams.get('compare') === 'previous';

  try {
    const rollups = await getDepartmentRollup(supabase, startDate, endDate, comparePrevious);
    return successResponse(rollups);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch department rollup';
    return errorResponse(message, 500);
  }
}
