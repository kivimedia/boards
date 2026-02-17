import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface MoveAllCardsBody {
  target_list_id?: string;
  archive?: boolean;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<MoveAllCardsBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const listId = params.id;
  const { target_list_id, archive } = body.body;

  if (archive) {
    // Get all card IDs in this list, then set is_archived = true
    const { data: placements } = await supabase
      .from('card_placements')
      .select('card_id')
      .eq('list_id', listId);

    if (placements && placements.length > 0) {
      const cardIds = placements.map((p) => p.card_id);
      const { error } = await supabase
        .from('cards')
        .update({ is_archived: true })
        .in('id', cardIds);

      if (error) return errorResponse(error.message, 500);

      // Remove placements for archived cards
      await supabase
        .from('card_placements')
        .delete()
        .eq('list_id', listId);
    }

    return successResponse({ archived: placements?.length ?? 0 });
  }

  if (!target_list_id) {
    return errorResponse('target_list_id is required when not archiving');
  }

  // Get max position in target list
  const { data: targetPlacements } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', target_list_id)
    .order('position', { ascending: false })
    .limit(1);

  let nextPos = (targetPlacements?.[0]?.position ?? -1) + 1;

  // Get source placements
  const { data: sourcePlacements } = await supabase
    .from('card_placements')
    .select('id')
    .eq('list_id', listId)
    .order('position');

  if (sourcePlacements && sourcePlacements.length > 0) {
    for (const p of sourcePlacements) {
      await supabase
        .from('card_placements')
        .update({ list_id: target_list_id, position: nextPos })
        .eq('id', p.id);
      nextPos++;
    }
  }

  return successResponse({ moved: sourcePlacements?.length ?? 0 });
}
