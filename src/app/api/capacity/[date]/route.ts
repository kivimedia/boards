import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getCapacityForDate } from '@/lib/capacity-engine';

interface Params {
  params: { date: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const dateStr = params.date;

  // Validate date format
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    return errorResponse('Invalid date format. Use YYYY-MM-DD.');
  }

  try {
    const capacity = await getCapacityForDate(supabase, userId, dateStr);
    return successResponse(capacity);
  } catch (err) {
    console.error('[Capacity] Error:', err);
    return errorResponse('Failed to get capacity info', 500);
  }
}
