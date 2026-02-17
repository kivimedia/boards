import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/api-helpers';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Fetch all lists with their board_id and a count of card_placements
  const { data: lists, error } = await supabase
    .from('lists')
    .select('board_id, card_placements(count)');

  if (error) {
    return NextResponse.json({}, { status: 200 });
  }

  const counts: Record<string, number> = {};
  for (const list of lists || []) {
    const boardId = list.board_id;
    const cardCount = (list.card_placements as any)?.[0]?.count ?? 0;
    counts[boardId] = (counts[boardId] || 0) + Number(cardCount);
  }

  return NextResponse.json(counts);
}
