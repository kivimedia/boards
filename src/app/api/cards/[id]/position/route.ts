import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/[id]/position
 * Returns the card's current 1-based rank within its list.
 * Lightweight endpoint used by CardModal's realtime position subscription.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data: placement, error } = await supabase
    .from('card_placements')
    .select('list_id, position')
    .eq('card_id', params.id)
    .eq('is_mirror', false)
    .single();

  if (error || !placement) {
    return errorResponse('Card placement not found', 404);
  }

  const { count } = await supabase
    .from('card_placements')
    .select('*', { count: 'exact', head: true })
    .eq('list_id', placement.list_id)
    .eq('is_mirror', false)
    .lt('position', placement.position);

  const cardPosition = (count ?? 0) + 1;

  return NextResponse.json({ cardPosition, listId: placement.list_id });
}
