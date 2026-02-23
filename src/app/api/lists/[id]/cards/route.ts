import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

const INT4_SAFE_THRESHOLD = 2_147_483_640;

/** Service-role client to bypass RLS for position renumbering */
function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

/**
 * Compute the next safe position for a card in a list.
 * If positions are near int4 overflow, renumber all cards in the list first.
 * Uses service role (adminClient) so RLS doesn't block UPDATE renumbering.
 * Falls back to the provided user-auth supabase if service role isn't configured.
 */
async function safeNextPositionServer(listId: string, fallbackDb: any) {
  const client = getAdminClient();
  const db = client ?? fallbackDb;
  if (!db) return 0;

  const { data: maxRow } = await db
    .from('card_placements')
    .select('position')
    .eq('list_id', listId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxPos: number = maxRow?.position ?? -1;

  if (maxPos >= INT4_SAFE_THRESHOLD) {
    // Renumber all cards sequentially to reclaim position space
    const { data: placements } = await db
      .from('card_placements')
      .select('id')
      .eq('list_id', listId)
      .order('position', { ascending: true });

    if (placements && placements.length > 0) {
      await Promise.all(
        placements.map((p: { id: string }, i: number) =>
          db.from('card_placements').update({ position: i }).eq('id', p.id)
        )
      );
      return placements.length;
    }
    return 0;
  }

  return maxPos + 1;
}

/**
 * POST /api/lists/[id]/cards
 * Create a new card and place it in this list.
 * Body: { title: string }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const listId = params.id;

  let title: string;
  try {
    const body = await request.json();
    title = (body.title || '').trim();
  } catch {
    return errorResponse('Invalid request body');
  }

  if (!title) return errorResponse('title is required');

  // Verify the list exists and get boardId for context
  const { data: list, error: listError } = await supabase
    .from('lists')
    .select('id, board_id')
    .eq('id', listId)
    .single();

  if (listError || !list) return errorResponse('List not found', 404);

  // Create the card
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .insert({ title, created_by: userId })
    .select()
    .single();

  if (cardError || !card) {
    return errorResponse(cardError?.message || 'Failed to create card', 500);
  }

  // Compute safe position server-side (bypasses RLS for renumbering)
  const position = await safeNextPositionServer(listId, supabase);

  // Place the card in the list
  const { error: placementError } = await supabase
    .from('card_placements')
    .insert({ card_id: card.id, list_id: listId, position, is_mirror: false });

  if (placementError) {
    // Card was created but placement failed — attempt cleanup
    await supabase.from('cards').delete().eq('id', card.id);
    return errorResponse(`Failed to place card: ${placementError.message}`, 500);
  }

  return successResponse(card, 201);
}
