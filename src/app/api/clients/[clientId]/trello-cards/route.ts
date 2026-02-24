import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getClientTrelloCards, linkTrelloCard } from '@/lib/trello-browse';

interface Params {
  params: Promise<{ clientId: string }>;
}

/**
 * GET /api/clients/[clientId]/trello-cards
 * List all Trello cards tracked for this client.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { clientId } = await params;

  try {
    const cards = await getClientTrelloCards(auth.ctx.supabase, clientId);
    return successResponse(cards);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch tracked cards', 500);
  }
}

interface LinkCardBody {
  trello_board_id: string;
  trello_board_name: string;
  trello_list_id: string;
  trello_list_name: string;
  trello_card_id: string;
  trello_card_name: string;
}

/**
 * POST /api/clients/[clientId]/trello-cards
 * Link a Trello card to this client.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<LinkCardBody>(request);
  if (!body.ok) return body.response;

  const { clientId } = await params;
  const { trello_board_id, trello_board_name, trello_list_id, trello_list_name, trello_card_id, trello_card_name } = body.body;

  if (!trello_card_id || !trello_card_name) {
    return errorResponse('trello_card_id and trello_card_name are required');
  }

  try {
    const card = await linkTrelloCard(
      auth.ctx.supabase,
      clientId,
      { trello_board_id, trello_board_name, trello_list_id, trello_list_name, trello_card_id, trello_card_name },
      auth.ctx.userId
    );
    return successResponse(card, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to link card';
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return errorResponse('This card is already tracked for this client', 409);
    }
    return errorResponse(msg, 500);
  }
}
