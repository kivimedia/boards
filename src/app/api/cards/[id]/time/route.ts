import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
} from '@/lib/api-helpers';
import { getCardTimeEntries, getCardTotalTime, getEstimateVsActual } from '@/lib/time-tracking';

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/[id]/time
 * Get time entries for a card plus total time and estimate vs actual.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  const [entries, totals, estimateVsActual] = await Promise.all([
    getCardTimeEntries(supabase, cardId),
    getCardTotalTime(supabase, cardId),
    getEstimateVsActual(supabase, cardId),
  ]);

  return successResponse({
    entries,
    totalMinutes: totals.totalMinutes,
    billableMinutes: totals.billableMinutes,
    estimatedHours: estimateVsActual.estimatedHours,
    actualHours: estimateVsActual.actualHours,
  });
}
