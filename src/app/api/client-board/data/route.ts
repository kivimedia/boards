import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/client-board/data
 * Returns the client's board with lists, card placements, and cards.
 * Only accessible by client-role users.
 */
export async function GET(_request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Verify user is a client
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_role, client_id')
    .eq('id', userId)
    .single();

  if (!profile || profile.user_role !== 'client' || !profile.client_id) {
    return errorResponse('Forbidden', 403);
  }

  const clientId = profile.client_id;

  // Get the client's board
  const { data: board } = await supabase
    .from('boards')
    .select('*')
    .eq('client_id', clientId)
    .eq('type', 'client_board')
    .single();

  if (!board) {
    return successResponse({ board: null, lists: [], cards: [], placements: [], client: null });
  }

  // Fetch lists, placements, cards, and client info in parallel
  const [listsRes, placementsRes, clientRes] = await Promise.all([
    supabase
      .from('lists')
      .select('*')
      .eq('board_id', board.id)
      .order('position'),
    supabase
      .from('card_placements')
      .select('*, cards(*)')
      .in(
        'list_id',
        (await supabase.from('lists').select('id').eq('board_id', board.id)).data?.map((l: any) => l.id) || []
      )
      .order('position'),
    supabase
      .from('clients')
      .select('id, name, company, contacts')
      .eq('id', clientId)
      .single(),
  ]);

  const lists = listsRes.data || [];
  const placements = placementsRes.data || [];

  // Extract unique cards from placements, only include client-visible ones
  const cardsMap = new Map<string, any>();
  for (const p of placements) {
    const card = (p as any).cards;
    if (card && card.is_client_visible && card.client_id === clientId) {
      cardsMap.set(card.id, card);
    }
  }

  // Filter placements to only those with valid visible cards
  const validPlacements = placements
    .filter((p: any) => cardsMap.has(p.card_id))
    .map((p: any) => ({
      id: p.id,
      card_id: p.card_id,
      list_id: p.list_id,
      position: p.position,
      is_mirror: p.is_mirror,
    }));

  return successResponse({
    board,
    lists,
    cards: Array.from(cardsMap.values()),
    placements: validPlacements,
    client: clientRes.data,
  });
}
