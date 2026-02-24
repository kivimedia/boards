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

async function resolvePosition(listId: string, index: number | undefined, fallback: any): Promise<number> {
  const db = getAdminClient() ?? fallback;
  const { data: existing } = await db
    .from('card_placements')
    .select('id')
    .eq('list_id', listId)
    .order('position', { ascending: true });
  const cards: { id: string }[] = existing || [];
  if (index === undefined || index < 0 || index >= cards.length) {
    if (cards.length > 0) {
      await Promise.all(cards.map((c, i) => db.from('card_placements').update({ position: i }).eq('id', c.id)));
    }
    return cards.length;
  }
  await Promise.all(
    cards.map((c, i) => db.from('card_placements').update({ position: i < index ? i : i + 1 }).eq('id', c.id))
  );
  return index;
}

/**
 * POST /api/cards/[id]/mirror
 * Body: { list_id: string }
 * Mirrors the card into the given list.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
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

  // Check card exists
  const { data: card } = await supabase.from('cards').select('id').eq('id', cardId).single();
  if (!card) return errorResponse('Card not found', 404);

  // Prevent duplicate mirrors in same list
  const { data: existing } = await db
    .from('card_placements')
    .select('id')
    .eq('card_id', cardId)
    .eq('list_id', listId)
    .maybeSingle();
  if (existing) return errorResponse('Card is already in that list', 409);

  const position = await resolvePosition(listId, positionIndex, db);

  const { error } = await db.from('card_placements').insert({
    card_id: cardId,
    list_id: listId,
    position,
    is_mirror: true,
  });

  if (error) return errorResponse(error.message, 500);
  return successResponse({ mirrored: true });
}
