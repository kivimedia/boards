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
 * POST /api/cards/[id]/move-to-list
 * Body: { list_id: string }
 * Moves the primary placement of a card to a new list, removes mirrors.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  let listId: string;
  try {
    const body = await request.json();
    listId = body.list_id;
  } catch {
    return errorResponse('Invalid request body');
  }

  if (!listId) return errorResponse('list_id is required');

  // Find primary placement
  const { data: placements } = await supabase
    .from('card_placements')
    .select('id')
    .eq('card_id', cardId)
    .eq('is_mirror', false)
    .limit(1);

  const placement = placements?.[0];
  if (!placement) return errorResponse('Primary card placement not found', 404);

  const position = await safeNextPos(listId, supabase);

  // Move primary placement
  const { error } = await supabase
    .from('card_placements')
    .update({ list_id: listId, position })
    .eq('id', placement.id);

  if (error) return errorResponse(error.message, 500);

  // Remove all mirror placements (card moved to new location)
  await supabase
    .from('card_placements')
    .delete()
    .eq('card_id', cardId)
    .eq('is_mirror', true);

  return successResponse({ moved: true });
}
