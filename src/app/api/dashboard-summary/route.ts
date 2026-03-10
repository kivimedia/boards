import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { canAccessBoardByRole } from '@/lib/permissions';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Fetch user's agency role
  const { data: profile } = await supabase
    .from('profiles')
    .select('agency_role')
    .eq('id', userId)
    .single();

  // Fetch all boards
  const { data: boards, error } = await supabase
    .from('boards')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message, 500);

  // Filter boards by agency role
  const agencyRole = profile?.agency_role ?? null;
  const filtered = agencyRole
    ? boards?.filter((board: any) => canAccessBoardByRole(agencyRole, board.type)) ?? []
    : boards ?? [];

  if (filtered.length === 0) return successResponse([]);

  const boardIds = filtered.map((b: any) => b.id);

  // Batch: fetch all lists for these boards
  const { data: allLists } = await supabase
    .from('lists')
    .select('id, name, position, board_id')
    .in('board_id', boardIds)
    .order('position', { ascending: true });

  // Count cards per list using parallel exact count queries (avoids 1000-row default limit)
  const listIds = (allLists || []).map((l: any) => l.id);
  const listCardCounts = new Map<string, number>();

  if (listIds.length > 0) {
    // Run count queries in parallel batches of 20
    const batchSize = 20;
    for (let i = 0; i < listIds.length; i += batchSize) {
      const batch = listIds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((listId: string) =>
          supabase
            .from('card_placements')
            .select('*', { count: 'exact', head: true })
            .eq('list_id', listId)
            .then(({ count }) => ({ listId, count: count || 0 }))
        )
      );
      for (const { listId, count } of results) {
        listCardCounts.set(listId, count);
      }
    }
  }

  // Batch: count recently moved cards per board (last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentMoves } = await supabase
    .from('activity_log')
    .select('board_id')
    .eq('event_type', 'card_moved')
    .in('board_id', boardIds)
    .gte('created_at', oneDayAgo);

  const recentMoveCounts = new Map<string, number>();
  for (const m of recentMoves || []) {
    recentMoveCounts.set(m.board_id, (recentMoveCounts.get(m.board_id) || 0) + 1);
  }

  // Group lists by board
  const listsByBoard = new Map<string, any[]>();
  for (const list of allLists || []) {
    if (!listsByBoard.has(list.board_id)) listsByBoard.set(list.board_id, []);
    listsByBoard.get(list.board_id)!.push(list);
  }

  // Assemble summaries
  const summaries = filtered.map((board: any) => {
    const boardLists = listsByBoard.get(board.id) || [];
    let totalCards = 0;
    const lists = boardLists.map((list: any) => {
      const cardCount = listCardCounts.get(list.id) || 0;
      totalCards += cardCount;
      return { id: list.id, name: list.name, cardCount };
    });
    return {
      board,
      totalCards,
      lists,
      recentlyMoved: recentMoveCounts.get(board.id) || 0,
    };
  });

  return successResponse(summaries);
}
