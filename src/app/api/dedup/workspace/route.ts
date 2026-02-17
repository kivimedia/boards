import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface BoardDedupResult {
  board_id: string;
  board_name: string;
  total_cards: number;
  duplicate_groups: number;
  duplicate_cards: number;
  groups: {
    title: string;
    keep: {
      card_id: string;
      list_name: string;
      comment_count: number;
      attachment_count: number;
    };
    remove: {
      card_id: string;
      list_name: string;
      comment_count: number;
      attachment_count: number;
    }[];
  }[];
}

/**
 * GET /api/dedup/workspace
 * Scans all boards (or selected boards) for duplicate cards.
 * Query params: board_ids (comma-separated, optional - defaults to all boards)
 * Returns per-board dedup report.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const url = new URL(request.url);
  const boardIdsParam = url.searchParams.get('board_ids');

  // Get boards to scan
  let boardsQuery = supabase
    .from('boards')
    .select('id, name')
    .eq('is_archived', false)
    .order('name');

  if (boardIdsParam) {
    const ids = boardIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
    boardsQuery = boardsQuery.in('id', ids);
  }

  const { data: boards, error: boardErr } = await boardsQuery;
  if (boardErr) return errorResponse('Failed to fetch boards');
  if (!boards || boards.length === 0) {
    return successResponse({ results: [], summary: { total_boards: 0, total_duplicates: 0 } });
  }

  const results: BoardDedupResult[] = [];

  for (const board of boards) {
    const result = await scanBoardForDuplicates(supabase, board.id, board.name);
    results.push(result);
  }

  const summary = {
    total_boards: boards.length,
    boards_with_duplicates: results.filter((r) => r.duplicate_cards > 0).length,
    total_duplicates: results.reduce((sum, r) => sum + r.duplicate_cards, 0),
    total_groups: results.reduce((sum, r) => sum + r.duplicate_groups, 0),
  };

  return successResponse({ results, summary });
}

async function scanBoardForDuplicates(
  supabase: any,
  boardId: string,
  boardName: string
): Promise<BoardDedupResult> {
  // Get lists
  const { data: lists } = await supabase
    .from('lists')
    .select('id, name')
    .eq('board_id', boardId);

  if (!lists || lists.length === 0) {
    return { board_id: boardId, board_name: boardName, total_cards: 0, duplicate_groups: 0, duplicate_cards: 0, groups: [] };
  }

  const listIds = lists.map((l: any) => l.id);
  const listNameMap = new Map(lists.map((l: any) => [l.id, l.name]));

  // Fetch all placements (paginated)
  let allPlacements: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page } = await supabase
      .from('card_placements')
      .select('id, card_id, list_id, is_mirror, card:cards(id, title, created_at, updated_at)')
      .in('list_id', listIds)
      .range(offset, offset + PAGE - 1);
    const rows = page || [];
    allPlacements = allPlacements.concat(rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  // Group by normalized title
  const byTitle = new Map<string, any[]>();
  for (const p of allPlacements) {
    if (!p.card || p.is_mirror) continue;
    const title = p.card.title.trim().toLowerCase();
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title)!.push(p);
  }

  // Only get metadata for duplicates
  const dupCardIds: string[] = [];
  byTitle.forEach((placements) => {
    if (placements.length > 1) {
      for (const p of placements) dupCardIds.push(p.card_id);
    }
  });

  if (dupCardIds.length === 0) {
    return {
      board_id: boardId,
      board_name: boardName,
      total_cards: allPlacements.filter((p: any) => !p.is_mirror).length,
      duplicate_groups: 0,
      duplicate_cards: 0,
      groups: [],
    };
  }

  // Batch count comments/attachments
  const commentCounts = new Map<string, number>();
  const attachCounts = new Map<string, number>();
  const BATCH = 200;
  const batches: string[][] = [];
  for (let i = 0; i < dupCardIds.length; i += BATCH) {
    batches.push(dupCardIds.slice(i, i + BATCH));
  }

  await Promise.all(
    batches.map(async (batch) => {
      const [{ data: comments }, { data: attachments }] = await Promise.all([
        supabase.from('comments').select('card_id').in('card_id', batch),
        supabase.from('attachments').select('card_id').in('card_id', batch),
      ]);
      for (const c of comments || []) {
        commentCounts.set(c.card_id, (commentCounts.get(c.card_id) || 0) + 1);
      }
      for (const a of attachments || []) {
        attachCounts.set(a.card_id, (attachCounts.get(a.card_id) || 0) + 1);
      }
    })
  );

  // Build groups
  const groups: BoardDedupResult['groups'] = [];
  byTitle.forEach((placements) => {
    if (placements.length <= 1) return;

    const scored = placements.map((p: any) => ({
      ...p,
      score_updated: new Date(p.card.updated_at || p.card.created_at).getTime(),
      score_comments: commentCounts.get(p.card_id) || 0,
      score_attachments: attachCounts.get(p.card_id) || 0,
    }));

    scored.sort((a: any, b: any) => {
      if (a.score_updated !== b.score_updated) return b.score_updated - a.score_updated;
      if (a.score_comments !== b.score_comments) return b.score_comments - a.score_comments;
      return b.score_attachments - a.score_attachments;
    });

    const keep = scored[0];
    const remove = scored.slice(1);

    groups.push({
      title: keep.card.title,
      keep: {
        card_id: keep.card_id,
        list_name: listNameMap.get(keep.list_id) as string || 'Unknown',
        comment_count: keep.score_comments,
        attachment_count: keep.score_attachments,
      },
      remove: remove.map((r: any) => ({
        card_id: r.card_id,
        list_name: listNameMap.get(r.list_id) as string || 'Unknown',
        comment_count: r.score_comments,
        attachment_count: r.score_attachments,
      })),
    });
  });

  groups.sort((a, b) => b.remove.length - a.remove.length);

  const totalDuplicates = groups.reduce((sum, g) => sum + g.remove.length, 0);

  return {
    board_id: boardId,
    board_name: boardName,
    total_cards: allPlacements.filter((p: any) => !p.is_mirror).length,
    duplicate_groups: groups.length,
    duplicate_cards: totalDuplicates,
    groups,
  };
}

interface CleanupBody {
  board_id: string;
  card_ids: string[];
}

/**
 * POST /api/dedup/workspace
 * Removes duplicate cards from specified boards.
 * Body: { actions: [{ board_id, card_ids }] } or single { board_id, card_ids }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{ actions?: CleanupBody[]; board_id?: string; card_ids?: string[] }>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const actions: CleanupBody[] = body.body.actions
    || (body.body.board_id && body.body.card_ids ? [{ board_id: body.body.board_id, card_ids: body.body.card_ids }] : []);

  if (actions.length === 0) {
    return errorResponse('No actions specified. Provide { actions: [{ board_id, card_ids }] }');
  }

  const report: { board_id: string; deleted: number; requested: number }[] = [];

  for (const action of actions) {
    const { board_id, card_ids } = action;
    if (!card_ids || card_ids.length === 0) continue;

    // Verify cards belong to this board
    const { data: lists } = await supabase
      .from('lists')
      .select('id')
      .eq('board_id', board_id);

    if (!lists || lists.length === 0) {
      report.push({ board_id, deleted: 0, requested: card_ids.length });
      continue;
    }

    const listIds = lists.map((l: any) => l.id);
    const { data: validPlacements } = await supabase
      .from('card_placements')
      .select('card_id')
      .in('list_id', listIds)
      .in('card_id', card_ids);

    const validCardIds = new Set((validPlacements || []).map((p: any) => p.card_id));
    const idsToDelete = card_ids.filter((id) => validCardIds.has(id));

    let deleted = 0;
    const BATCH = 50;
    for (let i = 0; i < idsToDelete.length; i += BATCH) {
      const batch = idsToDelete.slice(i, i + BATCH);

      const { data: batchChecklists } = await supabase
        .from('checklists')
        .select('id')
        .in('card_id', batch);
      const checklistIds = (batchChecklists || []).map((c: any) => c.id);
      if (checklistIds.length > 0) {
        await supabase.from('checklist_items').delete().in('checklist_id', checklistIds);
      }

      await Promise.all([
        supabase.from('card_placements').delete().in('card_id', batch),
        supabase.from('card_labels').delete().in('card_id', batch),
        supabase.from('card_assignees').delete().in('card_id', batch),
        supabase.from('comments').delete().in('card_id', batch),
        supabase.from('attachments').delete().in('card_id', batch),
        supabase.from('checklists').delete().in('card_id', batch),
      ]);

      const { error } = await supabase.from('cards').delete().in('id', batch);
      if (!error) deleted += batch.length;
    }

    report.push({ board_id, deleted, requested: card_ids.length });
  }

  const totalDeleted = report.reduce((sum, r) => sum + r.deleted, 0);
  return successResponse({ report, total_deleted: totalDeleted });
}
