import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { duplicateCard } from '@/lib/card-duplication';

interface Params {
  params: { id: string };
}

/**
 * POST /api/cards/[id]/duplicate
 * Duplicate the card.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    const result = await duplicateCard(supabase, params.id, userId);

    if (result === null) {
      return errorResponse('Failed to duplicate card', 500);
    }

    return successResponse(result, 201);
  } catch (err) {
    return errorResponse(
      `Failed to duplicate card: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
