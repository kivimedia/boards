import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface CreateCardBody {
  title: string;
  description?: string;
  list_id: string;
  position?: number;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateCardBody>(request);
  if (!body.ok) return body.response;

  const { title, description, list_id, position } = body.body;
  if (!title?.trim()) return errorResponse('Card title is required');
  if (!list_id) return errorResponse('List ID is required');

  const { supabase, userId } = auth.ctx;

  // Create the card
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .insert({
      title: title.trim(),
      description: description || '',
      created_by: userId,
    })
    .select()
    .single();

  if (cardError) return errorResponse(cardError.message, 500);

  // Determine position
  let pos = position;
  if (pos === undefined) {
    const { data: maxPlacement } = await supabase
      .from('card_placements')
      .select('position')
      .eq('list_id', list_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    pos = (maxPlacement?.position ?? -1) + 1;
  }

  // Create placement
  const { data: placement, error: placementError } = await supabase
    .from('card_placements')
    .insert({
      card_id: card.id,
      list_id,
      position: pos,
      is_mirror: false,
    })
    .select()
    .single();

  if (placementError) return errorResponse(placementError.message, 500);

  return successResponse({ ...card, placement }, 201);
}
