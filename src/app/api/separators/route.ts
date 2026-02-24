import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface CreateSeparatorBody {
  list_id: string;
  position: number;
  title?: string;
}

// POST: Create a separator card in a list
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateSeparatorBody>(request);
  if (!body.ok) return body.response;

  const { list_id, position, title } = body.body;
  if (!list_id) return errorResponse('list_id is required');

  const { supabase, userId } = auth.ctx;

  // Verify the list exists and get its board_id
  const { data: list, error: listError } = await supabase
    .from('lists')
    .select('id, board_id')
    .eq('id', list_id)
    .single();

  if (listError || !list) return errorResponse('List not found', 404);

  // Create the separator card
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .insert({
      title: title || '───────────',
      description: '',
      is_separator: true,
      created_by: userId,
      priority: 'none',
      size: 'small',
    })
    .select()
    .single();

  if (cardError) return errorResponse(cardError.message, 500);

  // Create placement
  const { error: placementError } = await supabase
    .from('card_placements')
    .insert({
      card_id: card.id,
      list_id,
      position: position ?? 0,
      is_mirror: false,
    });

  if (placementError) return errorResponse(placementError.message, 500);

  return successResponse(card, 201);
}

// GET: Get all separator positions across all boards (for "where am I" feature)
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('cards')
    .select(`
      id,
      title,
      card_placements (
        id,
        list_id,
        position,
        lists:list_id (
          id,
          name,
          board_id
        )
      )
    `)
    .eq('is_separator', true);

  if (error) return errorResponse(error.message, 500);

  return successResponse(data);
}
