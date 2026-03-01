import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/pageforge/designer-suggestions/search-cards?q=...
 * Search cards by title for the "comment on existing ticket" flow.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ cards: [] });
  }

  const { supabase } = auth.ctx;

  // Search cards by title (ilike)
  const { data: cards, error } = await supabase
    .from('cards')
    .select(`
      id,
      title,
      card_placements!inner(
        list_id,
        lists!inner(
          name,
          board_id,
          boards!inner(name)
        )
      )
    `)
    .ilike('title', `%${q}%`)
    .limit(15);

  if (error) return errorResponse(error.message, 500);

  const results = (cards || []).map((card: any) => {
    const placement = card.card_placements?.[0];
    const boardName = placement?.lists?.boards?.name || '';
    return {
      id: card.id,
      title: card.title,
      board_name: boardName,
    };
  });

  return NextResponse.json({ cards: results });
}
