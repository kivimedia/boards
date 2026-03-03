import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { fetchBoardMetadata } from '@/lib/board-data';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/data
 * Returns the full board with lists, cards, and all metadata.
 * Used by the client-side useBoard hook to load card data after SSR shell.
 * Server-side Supabase connection is much faster than client-side for large boards.
 *
 * Query params:
 *   ?lists=id1,id2,id3  -- Only load cards for specific lists (for two-phase loading)
 *   ?phase=visible       -- Marker indicating this is the first visible-only fetch
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;
  const url = new URL(_request.url);
  const listsParam = url.searchParams.get('lists');
  const maxCardsParam = url.searchParams.get('maxCards');
  const maxCardsPerList = maxCardsParam ? parseInt(maxCardsParam, 10) : 0;

  // Set a timeout to prevent middleware timeout errors
  // If phase=visible, use shorter timeout (30s) for phase-1 fast load
  // Otherwise use 50s timeout for full board load
  const isPhaseVisible = url.searchParams.get('phase') === 'visible';
  const timeoutMs = isPhaseVisible ? 30000 : 50000;
  
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Board data fetch timeout')), timeoutMs)
  );

  try {
    // Fetch board
    const { data: boardData, error: boardError } = await supabase
      .from('boards')
      .select('*')
      .eq('id', boardId)
      .single();

    if (boardError || !boardData) {
      return errorResponse('Board not found', 404);
    }

    // Fetch lists + labels in parallel
    const [{ data: listsData }, { data: labelsData }] = await Promise.all([
      supabase.from('lists').select('*').eq('board_id', boardId).order('position'),
      supabase.from('labels').select('*').eq('board_id', boardId),
    ]);

    const allLists = listsData || [];

    // If ?lists= param provided, only load metadata for those specific lists
    // Other lists are returned with empty cards arrays (loaded in phase 2)
    const requestedListIds = listsParam
      ? new Set(listsParam.split(',').filter(Boolean))
      : null;

    const listsToLoad = requestedListIds
      ? allLists.filter((l: any) => requestedListIds.has(l.id))
      : allLists;

    // Wrap metadata fetch in timeout race
    const { listsWithCards, timings } = await Promise.race([
      fetchBoardMetadata(
        supabase,
        boardId,
        listsToLoad,
        labelsData || [],
        maxCardsPerList,
      ),
      timeoutPromise as any,
    ]);

    // Build final lists array: loaded lists have cards, others get empty cards
    const loadedListMap = new Map<string, any>();
    for (const l of listsWithCards) {
      loadedListMap.set(l.id, l);
    }

    const finalLists = allLists.map((list: any) => {
      const loaded = loadedListMap.get(list.id);
      return loaded || { ...list, cards: [] };
    });

    return NextResponse.json({
      board: {
        ...boardData,
        lists: finalLists,
        labels: labelsData || [],
      },
      timings,
    });
  } catch (error) {
    console.error('Board data fetch error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to fetch board data',
      503
    );
  }
}
