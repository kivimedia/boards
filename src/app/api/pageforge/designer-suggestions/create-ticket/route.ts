import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

/**
 * POST /api/pageforge/designer-suggestions/create-ticket
 * Create a card (ticket) from designer suggestions.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { title, description, list_id, build_id } = body;

  if (!title?.trim()) return errorResponse('Title is required');
  if (!list_id?.trim()) return errorResponse('List ID is required');

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

  // Determine position (append to end of list)
  const { data: maxPlacement } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', list_id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const pos = (maxPlacement?.position ?? -1) + 1;

  // Create placement
  const { error: placementError } = await supabase
    .from('card_placements')
    .insert({
      card_id: card.id,
      list_id,
      position: pos,
      is_mirror: false,
    });

  if (placementError) return errorResponse(placementError.message, 500);

  // Also log that this ticket was created from a PageForge build
  if (build_id) {
    try {
      await supabase
        .from('pageforge_build_messages')
        .insert({
          build_id,
          role: 'system',
          sender_name: 'System',
          content: `Designer feedback ticket created: "${title.trim()}"`,
          metadata: { card_id: card.id, list_id },
        });
    } catch {
      // non-critical
    }
  }

  return NextResponse.json({ data: { id: card.id, title: card.title } }, { status: 201 });
}
