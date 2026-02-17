import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { aggregateSearch, searchCards, searchBoards, searchComments, searchPeople } from '@/lib/search';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const type = searchParams.get('type');
  const boardId = searchParams.get('board_id');

  if (!q || !q.trim()) {
    return errorResponse('Query parameter "q" is required');
  }

  const { supabase } = auth.ctx;

  try {
    let results;
    switch (type) {
      case 'cards':
        results = await searchCards(supabase, q, 10, boardId || undefined);
        break;
      case 'boards':
        results = await searchBoards(supabase, q);
        break;
      case 'comments':
        results = await searchComments(supabase, q);
        break;
      case 'people':
        results = await searchPeople(supabase, q);
        break;
      default:
        results = await aggregateSearch(supabase, q);
    }
    return successResponse(results);
  } catch (err) {
    return errorResponse(
      `Search failed: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
