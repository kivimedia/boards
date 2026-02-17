import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getClientVisibleCards } from '@/lib/client-portal';

/**
 * GET /api/client-portal/cards?clientId=xxx
 * Get all client-visible cards for the portal kanban view.
 * Requires clientId as a query parameter.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');

  if (!clientId) {
    return errorResponse('clientId query parameter is required');
  }

  const { supabase } = auth.ctx;

  try {
    const cards = await getClientVisibleCards(supabase, clientId);
    return successResponse(cards);
  } catch (err) {
    return errorResponse(
      `Failed to fetch client-visible cards: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
