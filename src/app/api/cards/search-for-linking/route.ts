import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q || q.length < 2) return successResponse([]);

  const { supabase } = auth.ctx;

  try {
    const { data, error } = await supabase
      .from('card_placements')
      .select(`
        card_id,
        cards!inner(id, title, client_id),
        lists!inner(id, name, boards!inner(id, name))
      `)
      .ilike('cards.title', `%${q}%`)
      .limit(20);

    if (error) throw error;

    const results = (data || []).map((row: any) => ({
      id: row.cards.id,
      title: row.cards.title,
      client_id: row.cards.client_id,
      boardName: row.lists?.boards?.name || '',
      listName: row.lists?.name || '',
    }));

    return successResponse(results);
  } catch (err) {
    return errorResponse(
      `Search failed: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
