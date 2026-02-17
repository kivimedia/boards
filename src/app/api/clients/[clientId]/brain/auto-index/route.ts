import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { autoIndexCard } from '@/lib/ai/client-brain';

interface Params {
  params: { clientId: string };
}

interface AutoIndexBody {
  cardId: string;
}

/**
 * POST /api/clients/[clientId]/brain/auto-index
 * Auto-index a card into the client brain.
 *
 * Body:
 *   cardId: string (required) - The card ID to index
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<AutoIndexBody>(request);
  if (!body.ok) return body.response;

  const { cardId } = body.body;
  const { supabase } = auth.ctx;
  const { clientId } = params;

  if (!cardId) {
    return errorResponse('cardId is required');
  }

  try {
    const chunksIndexed = await autoIndexCard(supabase, cardId, clientId);
    return successResponse({ cardId, chunksIndexed }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('not configured') || message.includes('API key')) {
      return errorResponse(message, 422);
    }

    return errorResponse(`Auto-index failed: ${message}`, 500);
  }
}
