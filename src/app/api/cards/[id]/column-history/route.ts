import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getCardColumnHistory } from '@/lib/productivity-analytics';

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/[id]/column-history
 * Retrieve column move history for a specific card.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: cardId } = params;

  try {
    const history = await getCardColumnHistory(supabase, cardId);
    return successResponse(history);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch card column history';
    return errorResponse(message, 500);
  }
}
