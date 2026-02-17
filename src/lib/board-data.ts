/**
 * Shared board data aggregation logic used by both:
 * - useBoard.ts (client-side via createBrowserClient)
 * - board/[id]/page.tsx (server-side via createServerSupabaseClient)
 *
 * This avoids duplicating the metadata query + aggregation code.
 *
 * PERFORMANCE OPTIMIZED (P8.2):
 * - Reduced card payload: only select columns needed for kanban view
 * - Batched cover image signing in groups of 20
 * - In-memory signed URL cache (1hr TTL)
 * - Timing instrumentation for profiling
 */

import { BoardWithLists, ListWithCards } from '@/lib/types';

/** Timing breakdown for board data loading. Passed to client for profiling toast. */
export interface BoardLoadTimings {
  placements: number;
  metadata: number;
  profiles: number;
  indexing: number;
  covers: number;
  total: number;
  cardCount: number;
  coverCount: number;
  cachedCovers: number;
}

/**
 * Supabase .in() uses GET requests with values in the URL.
 * With large UUID sets (>~200), the URL exceeds max length and returns "Bad Request".
 * This helper chunks the .in() into batches and merges results.
 */
// UUID = 36 chars + comma = 37 per ID. PostgREST URL limit ~32KB.
// 300 * 37 = 11.1KB — safely under limit while keeping reasonable chunk count.
const IN_BATCH_SIZE = 300;

async function batchedIn(
  supabase: any,
  table: string,
  selectStr: string,
  filterCol: string,
  ids: string[]
): Promise<any[]> {
  if (ids.length === 0) return [];

  // Split IDs into chunks to avoid Supabase URL length limit
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_BATCH_SIZE) {
    chunks.push(ids.slice(i, i + IN_BATCH_SIZE));
  }

  // For each chunk, paginate to handle Supabase's 1000-row default limit
  const ROW_LIMIT = 1000;
  async function fetchChunk(chunk: string[]): Promise<any[]> {
    let all: any[] = [];
    let offset = 0;
    while (true) {
      const { data } = await supabase
        .from(table)
        .select(selectStr)
        .in(filterCol, chunk)
        .range(offset, offset + ROW_LIMIT - 1);
      const rows = data || [];
      all = all.concat(rows);
      if (rows.length < ROW_LIMIT) break;
      offset += ROW_LIMIT;
    }
    return all;
  }

  const results = await Promise.all(chunks.map(fetchChunk));
  return results.flat();
}

/**
 * In-memory cache for signed cover image URLs.
 * Keys are storage paths, values are { url, expiresAt }.
 * TTL: 50 minutes (signed URLs expire at 60min, so we refresh 10min early).
 */
export const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
export const SIGNED_URL_TTL_MS = 50 * 60 * 1000; // 50 minutes

export function getCachedSignedUrl(path: string): string | null {
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (cached) signedUrlCache.delete(path); // expired
  return null;
}

export function setCachedSignedUrl(path: string, url: string): void {
  signedUrlCache.set(path, { url, expiresAt: Date.now() + SIGNED_URL_TTL_MS });
}

/**
 * Given a Supabase client and raw board/list data, fetches all card metadata
 * (placements, labels, assignees, comments, attachments, checklists) in batch
 * and returns assembled ListWithCards[].
 */
export async function fetchBoardMetadata(
  supabase: any,
  boardId: string,
  listsData: any[],
  labelsData: any[],
  /** Max cards to fetch per list. 0 = unlimited. Used for phase-1 fast loading. */
  maxCardsPerList: number = 0,
): Promise<{ listsWithCards: ListWithCards[]; labels: any[]; timings: BoardLoadTimings }> {
  const _t: Record<string, number> = {};
  const _mark = (label: string) => { _t[label] = performance.now(); };
  const _measure = (label: string) => performance.now() - (_t[label] || 0);

  _mark('total');
  const listIds = listsData.map((l) => l.id);

  // Fetch ALL placements for this board's lists
  // OPTIMIZED: Parallel fetch per-list to avoid sequential pagination for large boards
  // Each list's placements are fetched independently and in parallel
  _mark('placements');
  // OPTIMIZED: Exclude full description text to reduce payload (~500 chars avg per card).
  // Kanban view only needs has_description boolean. Full description loaded on card open.
  const PLACEMENT_SELECT = '*, card:cards(id, title, priority, due_date, cover_image_url, created_at, updated_at)';
  const PLACEMENT_PAGE_SIZE = 1000;

  async function fetchListPlacements(listId: string): Promise<any[]> {
    // If maxCardsPerList is set, only fetch that many (for fast phase-1 loading)
    if (maxCardsPerList > 0) {
      const { data } = await supabase
        .from('card_placements')
        .select(PLACEMENT_SELECT)
        .eq('list_id', listId)
        .order('position')
        .range(0, maxCardsPerList - 1);
      return data || [];
    }
    // Otherwise fetch all cards with pagination
    let all: any[] = [];
    let offset = 0;
    while (true) {
      const { data: page } = await supabase
        .from('card_placements')
        .select(PLACEMENT_SELECT)
        .eq('list_id', listId)
        .order('position')
        .range(offset, offset + PLACEMENT_PAGE_SIZE - 1);
      const rows = page || [];
      all = all.concat(rows);
      if (rows.length < PLACEMENT_PAGE_SIZE) break;
      offset += PLACEMENT_PAGE_SIZE;
    }
    return all;
  }

  const placementsByListRaw = await Promise.all(
    listIds.map((lid) => fetchListPlacements(lid))
  );
  const allPlacements = placementsByListRaw.flat();
  const placementsMs = _measure('placements');

  const allCardIds = allPlacements.map((p: any) => p.card_id);

  if (allCardIds.length === 0) {
    const timings: BoardLoadTimings = {
      placements: placementsMs, metadata: 0, profiles: 0,
      indexing: 0, covers: 0, total: _measure('total'),
      cardCount: 0, coverCount: 0, cachedCovers: 0,
    };
    return {
      listsWithCards: listsData.map((list) => ({ ...list, cards: [] })),
      labels: labelsData,
      timings,
    };
  }

  // ---- PHASE 2: Metadata + Explicit Cover Signing (in parallel) ----
  // Explicit covers (card.cover_image_url) are known from placements.
  // Start signing them immediately while metadata loads from DB.

  // Collect explicit covers from card.cover_image_url right away
  const coverByCard = new Map<string, string>();
  const explicitCoverCards = new Set<string>();
  for (const placement of allPlacements || []) {
    const card = placement.card;
    if (card?.cover_image_url) {
      coverByCard.set(card.id, card.cover_image_url);
      explicitCoverCards.add(card.id);
    }
  }

  // Helper: sign a set of storage paths using bulk API
  const coverSignedUrls = new Map<string, string>();
  async function signPaths(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const SIGN_BATCH = 200;
    const promises: Promise<void>[] = [];
    for (let i = 0; i < paths.length; i += SIGN_BATCH) {
      const batch = paths.slice(i, i + SIGN_BATCH);
      promises.push(
        supabase.storage.from('card-attachments').createSignedUrls(batch, 3600)
          .then(({ data }: { data: Array<{ path: string | null; signedUrl: string | null }> | null }) => {
            if (data) {
              data.forEach((item: { path: string | null; signedUrl: string | null }, j: number) => {
                if (item.signedUrl) {
                  coverSignedUrls.set(batch[j], item.signedUrl);
                  setCachedSignedUrl(batch[j], item.signedUrl);
                }
              });
            }
          })
      );
    }
    await Promise.all(promises);
  }

  // Determine which explicit covers need signing (not cached, not http URLs)
  const explicitStoragePaths: string[] = [];
  for (const path of Array.from(coverByCard.values())) {
    if (path.startsWith('http')) continue;
    const cached = getCachedSignedUrl(path);
    if (cached) {
      coverSignedUrls.set(path, cached);
    } else {
      explicitStoragePaths.push(path);
    }
  }

  // Run metadata queries + explicit cover signing IN PARALLEL
  _mark('metadata');

  // Lightweight description check: fetch just IDs of cards that have non-empty descriptions
  // This avoids sending ~500 chars/card of description text over the wire
  async function fetchCardsWithDescription(cardIds: string[]): Promise<Set<string>> {
    if (cardIds.length === 0) return new Set();
    const chunks: string[][] = [];
    for (let i = 0; i < cardIds.length; i += IN_BATCH_SIZE) {
      chunks.push(cardIds.slice(i, i + IN_BATCH_SIZE));
    }
    const results = await Promise.all(chunks.map(async (chunk) => {
      const { data } = await supabase
        .from('cards')
        .select('id')
        .in('id', chunk)
        .not('description', 'is', null)
        .neq('description', '');
      return (data || []).map((r: any) => r.id);
    }));
    return new Set(results.flat());
  }

  const [metadataResults, , cardsWithDescSet] = await Promise.all([
    // Metadata queries
    Promise.all([
      batchedIn(supabase, 'card_labels', 'card_id, label:labels(*)', 'card_id', allCardIds),
      batchedIn(supabase, 'card_assignees', 'card_id, user_id', 'card_id', allCardIds),
      batchedIn(supabase, 'comments', 'card_id', 'card_id', allCardIds),
      batchedIn(supabase, 'attachments', 'card_id, mime_type, storage_path', 'card_id', allCardIds),
      batchedIn(supabase, 'checklists', 'id, card_id', 'card_id', allCardIds),
    ]),
    // Sign explicit covers in parallel with metadata
    signPaths(Array.from(new Set(explicitStoragePaths))),
    // Lightweight description flag query
    fetchCardsWithDescription(allCardIds),
  ]);
  const [allCardLabels, allCardAssigneeRows, allComments, allAttachments, allChecklists] = metadataResults;
  const metadataMs = _measure('metadata');

  // Resolve assignee profiles: collect unique user_ids, batch-fetch profiles, then merge
  _mark('profiles');
  const uniqueUserIds = Array.from(new Set(allCardAssigneeRows.map((r: any) => r.user_id)));
  const profileRows = uniqueUserIds.length > 0
    ? await batchedIn(supabase, 'profiles', '*', 'id', uniqueUserIds)
    : [];
  const profileMap = new Map<string, any>();
  for (const p of profileRows) {
    profileMap.set(p.id, p);
  }
  const allCardAssignees = allCardAssigneeRows
    .map((r: any) => ({ card_id: r.card_id, user: profileMap.get(r.user_id) || null }))
    .filter((r: any) => r.user !== null);
  const profilesMs = _measure('profiles');

  // Fetch checklist items for all checklists
  const checklistIds = allChecklists.map((c: any) => c.id);
  let allChecklistItems: any[] = [];
  if (checklistIds.length > 0) {
    allChecklistItems = await batchedIn(
      supabase, 'checklist_items', 'checklist_id, is_completed', 'checklist_id', checklistIds
    );
  }

  // ---- PHASE 3: Index metadata + sign remaining covers ----
  _mark('indexing');
  const labelsByCard = new Map<string, any[]>();
  for (const cl of allCardLabels || []) {
    if (!cl.label) continue;
    const arr = labelsByCard.get(cl.card_id) || [];
    arr.push(cl.label);
    labelsByCard.set(cl.card_id, arr);
  }

  const assigneesByCard = new Map<string, any[]>();
  for (const ca of allCardAssignees || []) {
    if (!ca.user) continue;
    const arr = assigneesByCard.get(ca.card_id) || [];
    arr.push(ca.user);
    assigneesByCard.set(ca.card_id, arr);
  }

  const commentCountByCard = new Map<string, number>();
  for (const c of allComments || []) {
    commentCountByCard.set(c.card_id, (commentCountByCard.get(c.card_id) || 0) + 1);
  }

  const attachmentCountByCard = new Map<string, number>();
  // Auto-pick first image attachment as cover for cards without explicit cover
  for (const a of allAttachments || []) {
    attachmentCountByCard.set(a.card_id, (attachmentCountByCard.get(a.card_id) || 0) + 1);
    if (!explicitCoverCards.has(a.card_id) && !coverByCard.has(a.card_id) && a.mime_type?.startsWith('image/') && a.storage_path) {
      coverByCard.set(a.card_id, a.storage_path);
    }
  }

  const checklistToCard = new Map<string, string>();
  for (const cl of allChecklists || []) {
    checklistToCard.set(cl.id, cl.card_id);
  }
  const checklistByCard = new Map<string, { total: number; done: number }>();
  for (const item of allChecklistItems) {
    const cardId = checklistToCard.get(item.checklist_id);
    if (!cardId) continue;
    const entry = checklistByCard.get(cardId) || { total: 0, done: 0 };
    entry.total++;
    if (item.is_completed) entry.done++;
    checklistByCard.set(cardId, entry);
  }
  const indexingMs = _measure('indexing');

  // Sign any remaining auto-picked covers (from attachments, not yet signed)
  _mark('covers');
  const remainingUncached: string[] = [];
  for (const path of Array.from(coverByCard.values())) {
    if (path.startsWith('http') || coverSignedUrls.has(path)) continue;
    const cached = getCachedSignedUrl(path);
    if (cached) {
      coverSignedUrls.set(path, cached);
    } else {
      remainingUncached.push(path);
    }
  }
  await signPaths(Array.from(new Set(remainingUncached)));
  const coversMs = _measure('covers');

  // Group placements by list and attach all metadata
  const placementsByList = new Map<string, any[]>();
  for (const placement of allPlacements || []) {
    const cardId = placement.card_id;
    const rawCoverPath = coverByCard.get(cardId);
    let resolvedCover: string | null = null;
    if (rawCoverPath) {
      if (rawCoverPath.startsWith('http')) {
        // Already a full URL (explicit cover saved as URL)
        resolvedCover = rawCoverPath;
      } else {
        // Storage path - use signed URL
        resolvedCover = coverSignedUrls.get(rawCoverPath) || null;
      }
    }
    const card = placement.card || {};
    const arr = placementsByList.get(placement.list_id) || [];
    arr.push({
      id: placement.id,
      card_id: cardId,
      list_id: placement.list_id,
      position: placement.position,
      is_mirror: placement.is_mirror,
      card: {
        id: card.id,
        title: card.title,
        description: cardsWithDescSet.has(cardId) ? '[has content]' : '',
        priority: card.priority,
        due_date: card.due_date,
        created_at: card.created_at,
        updated_at: card.updated_at,
      },
      labels: labelsByCard.get(cardId) || [],
      assignees: assigneesByCard.get(cardId) || [],
      comment_count: commentCountByCard.get(cardId) || 0,
      attachment_count: attachmentCountByCard.get(cardId) || 0,
      checklist_total: checklistByCard.get(cardId)?.total || 0,
      checklist_done: checklistByCard.get(cardId)?.done || 0,
      cover_image_url: resolvedCover,
    });
    placementsByList.set(placement.list_id, arr);
  }

  const listsWithCards: ListWithCards[] = listsData.map((list) => ({
    ...list,
    cards: placementsByList.get(list.id) || [],
  }));

  const timings: BoardLoadTimings = {
    placements: placementsMs,
    metadata: metadataMs,
    profiles: profilesMs,
    indexing: indexingMs,
    covers: coversMs,
    total: _measure('total'),
    cardCount: allCardIds.length,
    coverCount: coverSignedUrls.size,
    cachedCovers: coverSignedUrls.size - new Set([...explicitStoragePaths, ...remainingUncached]).size,
  };
  return { listsWithCards, labels: labelsData, timings };
}
