import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getCardRevisionMetrics } from '@/lib/revision-analysis';

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/:id/revision-metrics
 * Return revision metrics for a single card (most recent computation).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  try {
    const metrics = await getCardRevisionMetrics(supabase, cardId);

    if (!metrics) {
      return errorResponse('No revision metrics found for this card', 404);
    }

    return successResponse(metrics);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch card revision metrics';
    return errorResponse(message, 500);
  }
}
