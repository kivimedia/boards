import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getClientSatisfaction, submitSatisfaction } from '@/lib/client-portal';

interface Params {
  params: { clientId: string };
}

/**
 * GET /api/clients/[clientId]/satisfaction
 * Get satisfaction stats (average rating and count) for a client.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const satisfaction = await getClientSatisfaction(supabase, params.clientId);
    return successResponse(satisfaction);
  } catch (err) {
    return errorResponse(
      `Failed to fetch satisfaction data: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface SubmitSatisfactionBody {
  cardId?: string | null;
  rating: number;
  feedback?: string;
}

/**
 * POST /api/clients/[clientId]/satisfaction
 * Submit a satisfaction response for a client.
 *
 * Body:
 *   cardId?: string | null - The card this rating is for (optional)
 *   rating: number (required, 1-5)
 *   feedback?: string
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<SubmitSatisfactionBody>(request);
  if (!body.ok) return body.response;

  const { cardId, rating, feedback } = body.body;
  if (rating === undefined || rating === null) return errorResponse('rating is required');
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    return errorResponse('rating must be a number between 1 and 5');
  }

  const { supabase, userId } = auth.ctx;

  try {
    const response = await submitSatisfaction(
      supabase,
      params.clientId,
      userId,
      cardId ?? null,
      rating,
      feedback
    );

    if (!response) {
      return errorResponse('Failed to submit satisfaction response', 500);
    }

    return successResponse(response, 201);
  } catch (err) {
    return errorResponse(
      `Failed to submit satisfaction: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
