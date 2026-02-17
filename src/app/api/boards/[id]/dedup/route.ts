import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface DupGroup {
  title: string;
  keep: {
    card_id: string;
    placement_id: string;
    list_name: string;
    created_at: string;
    comment_count: number;
    attachment_count: number;
  };
  remove: {
    card_id: string;
    placement_id: string;
    list_name: string;
    created_at: string;
    comment_count: number;
    attachment_count: number;
  }[];
}

/**
 * GET /api/boards/[id]/dedup
 * Finds duplicate cards (same title) within the board.
 * Returns groups with which to keep (latest/most metadata) and which to remove.
 *
 * OPTIMIZED: First finds duplicate titles cheaply, then only fetches metadata
 * for the ~60-70 cards that are actually duplicates (instead of ALL 3400+).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  // 1. Get all lists for this board
  const { data: lists, error: listErr } = await supabase
    .from('lists')
    .select('id, name')
    .eq('board_id', boardId);

  if (listErr || !lists || lists.length === 0) {
    return successResponse({ groups: [], totalDuplicates: 0 });
  }

  const listIds = lists.map((l: any) => l.id);
  const listNameMap = new Map(lists.map((l: any) => [l.id, l.name]));

  // 2. Fetch all placements (paginated for large boards)
  //    Only fetch minimal fields needed for title grouping
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

  // 3. Group by normalized title FIRST (cheap - no DB calls)
  const byTitle = new Map<string, any[]>();
  for (const p of allPlacements) {
    if (!p.card || p.is_mirror) continue;
    const title = p.card.title.trim().toLowerCase();
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title)!.push(p);
  }

  // 4. Collect ONLY the card_ids that are actually duplicates
  const dupCardIds: string[] = [];
  byTitle.forEach((placements) => {
    if (placements.length > 1) {
      for (const p of placements) {
        dupCardIds.push(p.card_id);
      }
    }
  });

  if (dupCardIds.length === 0) {
    return successResponse({ groups: [], totalDuplicates: 0 });
  }

  // 5. Batch-count comments and attachments ONLY for duplicate cards
  //    This is typically ~60-70 cards instead of 3400+, so it's very fast
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

  // 6. Build duplicate groups
  const groups: DupGroup[] = [];
  byTitle.forEach((placements) => {
    if (placements.length <= 1) return;

    // Score each placement: higher = more valuable = keep it
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
        placement_id: keep.id,
        list_name: listNameMap.get(keep.list_id) || 'Unknown',
        created_at: keep.card.created_at,
        comment_count: keep.score_comments,
        attachment_count: keep.score_attachments,
      },
      remove: remove.map((r: any) => ({
        card_id: r.card_id,
        placement_id: r.id,
        list_name: listNameMap.get(r.list_id) || 'Unknown',
        created_at: r.card.created_at,
        comment_count: r.score_comments,
        attachment_count: r.score_attachments,
      })),
    });
  });

  // Sort by number of duplicates (most first)
  groups.sort((a, b) => b.remove.length - a.remove.length);

  const totalDuplicates = groups.reduce((sum, g) => sum + g.remove.length, 0);

  return successResponse({ groups, totalDuplicates });
}

interface CleanupBody {
  card_ids: string[]; // Card IDs to delete (the duplicates)
}

/**
 * POST /api/boards/[id]/dedup
 * Deletes the specified duplicate cards (and their placements/metadata).
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CleanupBody>(request);
  if (!body.ok) return body.response;

  const { card_ids } = body.body;
  if (!card_ids || !Array.isArray(card_ids) || card_ids.length === 0) {
    return errorResponse('card_ids array is required');
  }

  const { supabase } = auth.ctx;

  // Safety: verify these cards actually belong to this board
  const { data: lists } = await supabase
    .from('lists')
    .select('id')
    .eq('board_id', params.id);

  if (!lists || lists.length === 0) {
    return errorResponse('Board not found or has no lists', 404);
  }

  const listIds = lists.map((l: any) => l.id);
  const { data: validPlacements } = await supabase
    .from('card_placements')
    .select('card_id')
    .in('list_id', listIds)
    .in('card_id', card_ids);

  const validCardIds = new Set((validPlacements || []).map((p: any) => p.card_id));
  const idsToDelete = card_ids.filter((id) => validCardIds.has(id));

  if (idsToDelete.length === 0) {
    return errorResponse('None of the specified cards belong to this board');
  }

  // Delete in batches
  let deleted = 0;
  const BATCH = 50;
  for (let i = 0; i < idsToDelete.length; i += BATCH) {
    const batch = idsToDelete.slice(i, i + BATCH);

    // Delete checklist items first (need to resolve checklist IDs)
    const { data: batchChecklists } = await supabase
      .from('checklists')
      .select('id')
      .in('card_id', batch);
    const checklistIds = (batchChecklists || []).map((c: any) => c.id);
    if (checklistIds.length > 0) {
      await supabase.from('checklist_items').delete().in('checklist_id', checklistIds);
    }

    // Delete other child records in parallel
    await Promise.all([
      supabase.from('card_placements').delete().in('card_id', batch),
      supabase.from('card_labels').delete().in('card_id', batch),
      supabase.from('card_assignees').delete().in('card_id', batch),
      supabase.from('comments').delete().in('card_id', batch),
      supabase.from('attachments').delete().in('card_id', batch),
      supabase.from('checklists').delete().in('card_id', batch),
    ]);

    // Delete the cards themselves
    const { error } = await supabase.from('cards').delete().in('id', batch);
    if (!error) deleted += batch.length;
  }

  return successResponse({ deleted, requested: card_ids.length });
}
