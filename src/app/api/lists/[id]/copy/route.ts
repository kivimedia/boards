import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface CopyListBody {
  board_id: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CopyListBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const listId = params.id;

  // Fetch the source list
  const { data: sourceList, error: listErr } = await supabase
    .from('lists')
    .select('*')
    .eq('id', listId)
    .single();

  if (listErr || !sourceList) return errorResponse('List not found', 404);

  // Get max position in the board
  const { data: lists } = await supabase
    .from('lists')
    .select('position')
    .eq('board_id', sourceList.board_id)
    .order('position', { ascending: false })
    .limit(1);

  const maxPos = lists?.[0]?.position ?? 0;

  // Create the new list
  const { data: newList, error: createErr } = await supabase
    .from('lists')
    .insert({
      board_id: sourceList.board_id,
      name: `${sourceList.name} (copy)`,
      position: maxPos + 1,
    })
    .select()
    .single();

  if (createErr || !newList) return errorResponse(createErr?.message || 'Failed to create list', 500);

  // Copy all card placements to the new list
  const { data: placements } = await supabase
    .from('card_placements')
    .select('card_id, position, is_mirror')
    .eq('list_id', listId)
    .order('position');

  if (placements && placements.length > 0) {
    const newPlacements = placements.map((p) => ({
      card_id: p.card_id,
      list_id: newList.id,
      position: p.position,
      is_mirror: true, // copies are mirrors of the original cards
    }));

    await supabase.from('card_placements').insert(newPlacements);
  }

  return successResponse(newList, 201);
}
