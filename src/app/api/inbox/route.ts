import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/inbox
 * Fetch unassigned cards across all accessible boards, grouped by board.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    // Fetch all cards that have NO assignees, with their placement + board info
    // Strategy: get all card_placements with nested data, then filter out those with assignees
    const { data: placements, error } = await supabase
      .from('card_placements')
      .select(`
        id,
        card_id,
        position,
        created_at,
        card:cards(id, title, description, priority, due_date, created_at),
        list:lists(id, name, board_id, board:boards(id, name, type, is_archived))
      `)
      .eq('is_mirror', false)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return errorResponse(error.message, 500);
    if (!placements || placements.length === 0) return successResponse([]);

    // Get all card IDs from placements
    const cardIds = placements.map((p: any) => p.card_id);

    // Fetch which cards have assignees (in batches if needed)
    const { data: assignedCards } = await supabase
      .from('card_assignees')
      .select('card_id')
      .in('card_id', cardIds);

    const assignedSet = new Set((assignedCards || []).map((a: any) => a.card_id));

    // Filter to only unassigned cards on non-archived boards
    const unassigned = placements
      .filter((p: any) => {
        const board = (p.list as any)?.board;
        return !assignedSet.has(p.card_id) && board && !board.is_archived;
      })
      .map((p: any) => {
        const card = p.card as any;
        const list = p.list as any;
        const board = list?.board as any;
        return {
          placementId: p.id,
          cardId: card?.id,
          title: card?.title || 'Untitled',
          priority: card?.priority || 'none',
          dueDate: card?.due_date || null,
          createdAt: card?.created_at || p.created_at,
          listName: list?.name || 'Unknown',
          listId: list?.id,
          boardId: board?.id,
          boardName: board?.name || 'Unknown Board',
          boardType: board?.type || 'dev',
        };
      });

    return successResponse(unassigned);
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch inbox', 500);
  }
}
