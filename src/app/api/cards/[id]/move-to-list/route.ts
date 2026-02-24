import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

const INT4_SAFE_THRESHOLD = 2_147_483_640;

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

async function safeNextPos(listId: string, fallback: any): Promise<number> {
  const db = getAdminClient() ?? fallback;
  const { data: maxRow } = await db
    .from('card_placements')
    .select('position')
    .eq('list_id', listId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxPos: number = maxRow?.position ?? -1;
  if (maxPos >= INT4_SAFE_THRESHOLD) {
    const { data: placements } = await db
      .from('card_placements')
      .select('id')
      .eq('list_id', listId)
      .order('position', { ascending: true });
    if (placements?.length) {
      await Promise.all(placements.map((p: any, i: number) =>
        db.from('card_placements').update({ position: i }).eq('id', p.id)
      ));
      return placements.length;
    }
    return 0;
  }
  return maxPos + 1;
}

/**
 * Resolve position for inserting a card at a specific index in a list.
 * index = 0 → top, -1/undefined → bottom.
 * Renumbers existing cards sequentially to make a clean gap.
 * Returns the position the new card should receive.
 */
async function resolvePosition(listId: string, index: number | undefined, fallback: any): Promise<number> {
  const db = getAdminClient() ?? fallback;

  // Fetch existing placements ordered by current position
  const { data: existing } = await db
    .from('card_placements')
    .select('id')
    .eq('list_id', listId)
    .order('position', { ascending: true });

  const cards: { id: string }[] = existing || [];

  // -1 or undefined = append at end
  if (index === undefined || index < 0 || index >= cards.length) {
    // Renumber existing cards 0..n-1, new card gets n
    if (cards.length > 0) {
      await Promise.all(
        cards.map((c, i) => db.from('card_placements').update({ position: i }).eq('id', c.id))
      );
    }
    return cards.length;
  }

  // Insert at index: renumber cards 0..index-1 stay, index..end shift up by 1
  // New card gets position = index
  await Promise.all(
    cards.map((c, i) =>
      db.from('card_placements').update({ position: i < index ? i : i + 1 }).eq('id', c.id)
    )
  );
  return index;
}

/**
 * POST /api/cards/[id]/move-to-list
 * Body: { list_id: string }
 * Moves the primary placement of a card to a new list, removes mirrors.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const cardId = params.id;

  let listId: string;
  let positionIndex: number | undefined;
  try {
    const body = await request.json();
    listId = body.list_id;
    positionIndex = body.position_index;
  } catch {
    return errorResponse('Invalid request body');
  }

  if (!listId) return errorResponse('list_id is required');

  // Use admin client to bypass RLS
  const db = getAdminClient();
  if (!db) return errorResponse('Service role key not configured', 500);

  // Find primary placement
  const { data: placements } = await db
    .from('card_placements')
    .select('id')
    .eq('card_id', cardId)
    .eq('is_mirror', false)
    .limit(1);

  const placement = placements?.[0];
  if (!placement) return errorResponse('Primary card placement not found', 404);

  const position = await resolvePosition(listId, positionIndex, db);

  // Move primary placement
  const { error } = await db
    .from('card_placements')
    .update({ list_id: listId, position })
    .eq('id', placement.id);

  if (error) return errorResponse(error.message, 500);

  // Remove all mirror placements (card moved to new location)
  await db
    .from('card_placements')
    .delete()
    .eq('card_id', cardId)
    .eq('is_mirror', true);

  return successResponse({ moved: true });
}
