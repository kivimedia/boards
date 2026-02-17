import { SupabaseClient } from '@supabase/supabase-js';
import { isS3Configured, shouldUseS3, uploadToS3, buildS3Key } from './s3';
import type {
  BoardType,
  MigrationJobConfig,
  MigrationReport,
  MigrationEntityType,
  TrelloBoard,
  TrelloMember,
  TrelloList,
  TrelloCard,
  TrelloLabel,
  TrelloComment,
  TrelloChecklist,
  TrelloAttachment,
} from './types';
import { BOARD_TYPE_CONFIG } from './constants';

const TRELLO_API_BASE = 'https://api.trello.com/1';

// ============================================================================
// TRELLO API CLIENT
// ============================================================================

interface TrelloAuth {
  key: string;
  token: string;
}

async function trelloFetch<T>(
  path: string,
  auth: TrelloAuth,
  params: Record<string, string> = {},
  retries = 3
): Promise<T> {
  const url = new URL(`${TRELLO_API_BASE}${path}`);
  url.searchParams.set('key', auth.key);
  url.searchParams.set('token', auth.token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60000) });
      if (res.status === 429) {
        // Trello rate limit — wait and retry
        const retryAfter = parseInt(res.headers.get('retry-after') || '10', 10);
        console.warn(`[TrelloMigration] Rate limited on ${path}, waiting ${retryAfter}s (attempt ${attempt}/${retries})`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (!res.ok) {
        throw new Error(`Trello API error: ${res.status} ${res.statusText} for ${path}`);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.warn(`[TrelloMigration] Attempt ${attempt}/${retries} failed for ${path}: ${err instanceof Error ? err.message : err}. Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`trelloFetch failed after ${retries} retries for ${path}`);
}

export async function fetchTrelloBoards(auth: TrelloAuth): Promise<TrelloBoard[]> {
  return trelloFetch<TrelloBoard[]>('/members/me/boards', auth, { filter: 'open' });
}

export async function fetchTrelloBoard(auth: TrelloAuth, boardId: string): Promise<TrelloBoard> {
  return trelloFetch<TrelloBoard>(`/boards/${boardId}`, auth);
}

export async function fetchTrelloBoardMembers(auth: TrelloAuth, boardId: string): Promise<TrelloMember[]> {
  return trelloFetch<TrelloMember[]>(`/boards/${boardId}/members`, auth);
}

export async function fetchTrelloLists(auth: TrelloAuth, boardId: string): Promise<TrelloList[]> {
  return trelloFetch<TrelloList[]>(`/boards/${boardId}/lists`, auth, { filter: 'all' });
}

export async function fetchTrelloCards(auth: TrelloAuth, boardId: string): Promise<TrelloCard[]> {
  // Trello returns all cards in one request (pagination doesn't work on this endpoint)
  return trelloFetch<TrelloCard[]>(`/boards/${boardId}/cards`, auth, { filter: 'all' });
}

export async function fetchTrelloLabels(auth: TrelloAuth, boardId: string): Promise<TrelloLabel[]> {
  return trelloFetch<TrelloLabel[]>(`/boards/${boardId}/labels`, auth);
}

export async function fetchTrelloComments(auth: TrelloAuth, boardId: string): Promise<TrelloComment[]> {
  return trelloFetch<TrelloComment[]>(`/boards/${boardId}/actions`, auth, {
    filter: 'commentCard',
    limit: '1000',
  });
}

export async function fetchTrelloChecklists(auth: TrelloAuth, cardId: string): Promise<TrelloChecklist[]> {
  return trelloFetch<TrelloChecklist[]>(`/cards/${cardId}/checklists`, auth);
}

export async function fetchTrelloAttachments(auth: TrelloAuth, cardId: string): Promise<TrelloAttachment[]> {
  return trelloFetch<TrelloAttachment[]>(`/cards/${cardId}/attachments`, auth);
}

// ============================================================================
// ENTITY MAPPING (Trello → Agency Board)
// ============================================================================

const TRELLO_COLOR_MAP: Record<string, string> = {
  green: '#10b981',
  yellow: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
  purple: '#8b5cf6',
  blue: '#3b82f6',
  sky: '#0ea5e9',
  lime: '#84cc16',
  pink: '#ec4899',
  black: '#1e293b',
};

/**
 * Map a Trello label color string to a hex color.
 */
export function mapTrelloColor(trelloColor: string): string {
  return TRELLO_COLOR_MAP[trelloColor] || '#94a3b8';
}

/**
 * Map Trello card priority based on label colors/names.
 * Looks for labels named "urgent", "high", "medium", "low" (case-insensitive).
 */
export function inferPriority(
  trelloCard: TrelloCard,
  trelloLabels: TrelloLabel[]
): string {
  const cardLabels = trelloLabels.filter((l) =>
    trelloCard.idLabels.includes(l.id)
  );

  for (const label of cardLabels) {
    const name = label.name.toLowerCase();
    if (name.includes('urgent') || name.includes('critical')) return 'urgent';
    if (name.includes('high')) return 'high';
    if (name.includes('medium')) return 'medium';
    if (name.includes('low')) return 'low';
  }

  return 'none';
}

// ============================================================================
// ENTITY MAP HELPERS (for idempotency)
// ============================================================================

async function recordMapping(
  supabase: SupabaseClient,
  jobId: string,
  sourceType: MigrationEntityType,
  sourceId: string,
  targetId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await supabase.from('migration_entity_map').insert({
    job_id: jobId,
    source_type: sourceType,
    source_id: sourceId,
    target_id: targetId,
    metadata,
  });
}

async function getExistingMapping(
  supabase: SupabaseClient,
  jobId: string,
  sourceType: MigrationEntityType,
  sourceId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('migration_entity_map')
    .select('target_id')
    .eq('job_id', jobId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .single();

  return data?.target_id || null;
}

/**
 * Batch-load all existing mappings for given entity types.
 * Returns a Map with keys like "card:trelloId" → "targetId".
 * This replaces thousands of individual getExistingMapping calls with one query.
 */
async function batchGetMappings(
  supabase: SupabaseClient,
  jobId: string,
  sourceTypes: MigrationEntityType[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const sourceType of sourceTypes) {
    let offset = 0;
    const pageSize = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await supabase
        .from('migration_entity_map')
        .select('source_id, target_id')
        .eq('job_id', jobId)
        .eq('source_type', sourceType)
        .range(offset, offset + pageSize - 1);
      if (!data || data.length === 0) break;
      for (const row of data) {
        map.set(`${sourceType}:${row.source_id}`, row.target_id);
      }
      if (data.length < pageSize) break;
      offset += pageSize;
    }
  }
  return map;
}

/**
 * Batch-load mappings across ALL jobs (not just current) for cross-job deduplication.
 * Returns a Set with keys like "card:trelloId" — only checks existence, not target IDs.
 * Prevents duplicate imports when re-importing the same Trello board in a new job.
 */
async function getGlobalMappings(
  supabase: SupabaseClient,
  currentJobId: string,
  sourceTypes: MigrationEntityType[]
): Promise<Set<string>> {
  const globalSet = new Set<string>();
  for (const sourceType of sourceTypes) {
    let offset = 0;
    const pageSize = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await supabase
        .from('migration_entity_map')
        .select('source_id')
        .eq('source_type', sourceType)
        .neq('job_id', currentJobId)
        .range(offset, offset + pageSize - 1);
      if (!data || data.length === 0) break;
      for (const row of data) {
        globalSet.add(`${sourceType}:${row.source_id}`);
      }
      if (data.length < pageSize) break;
      offset += pageSize;
    }
  }
  return globalSet;
}

/**
 * Check if an entity was already migrated (idempotency).
 */
export async function isAlreadyMigrated(
  supabase: SupabaseClient,
  jobId: string,
  sourceType: MigrationEntityType,
  sourceId: string
): Promise<boolean> {
  const existing = await getExistingMapping(supabase, jobId, sourceType, sourceId);
  return existing !== null;
}

// ============================================================================
// MIGRATION PROGRESS HELPERS
// ============================================================================

async function updateProgress(
  supabase: SupabaseClient,
  jobId: string,
  current: number,
  total: number,
  phase: string,
  detail?: string
): Promise<void> {
  const progress = { current, total, phase, detail };
  _cachedProgress = progress;
  await supabase
    .from('migration_jobs')
    .update({ progress })
    .eq('id', jobId);
}

// Cache of last known progress for fast detail updates (avoids read-then-write)
let _cachedProgress: Record<string, unknown> = {};

async function updateDetail(
  supabase: SupabaseClient,
  jobId: string,
  detail: string
): Promise<void> {
  const progress = { ..._cachedProgress, detail };
  await supabase
    .from('migration_jobs')
    .update({ progress })
    .eq('id', jobId);
}

async function updateReport(
  supabase: SupabaseClient,
  jobId: string,
  report: MigrationReport
): Promise<void> {
  await supabase
    .from('migration_jobs')
    .update({ report })
    .eq('id', jobId);
}

// ============================================================================
// MAIN MIGRATION RUNNER
// ============================================================================

/**
 * Run a full Trello migration job.
 * This processes boards in order: boards → labels → lists → cards → comments → attachments → checklists
 */
export async function runMigration(
  supabase: SupabaseClient,
  jobId: string,
  config: MigrationJobConfig,
  userId: string
): Promise<MigrationReport> {
  const auth: TrelloAuth = { key: config.trello_api_key, token: config.trello_token };

  // Count actual entities from migration_entity_map (ground truth, survives crashes)
  async function countMappings(type: MigrationEntityType): Promise<number> {
    const { count } = await supabase
      .from('migration_entity_map')
      .select('*', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .eq('source_type', type);
    return count ?? 0;
  }

  const [boards, lists, cards, comments, attachments, labels, checklists] = await Promise.all([
    countMappings('board'), countMappings('list'), countMappings('card'),
    countMappings('comment'), countMappings('attachment'), countMappings('label'),
    countMappings('checklist'),
  ]);

  const report: MigrationReport = {
    boards_created: boards,
    lists_created: lists,
    cards_created: cards,
    comments_created: comments,
    attachments_created: attachments,
    labels_created: labels,
    checklists_created: checklists,
    errors: [],
  };

  // Mark job as running and save accurate report immediately
  await supabase
    .from('migration_jobs')
    .update({ status: 'running', started_at: new Date().toISOString(), report })
    .eq('id', jobId);

  try {
    const totalSteps = config.board_ids.length * 7; // 7 phases per board
    let currentStep = 0;

    const totalBoards = config.board_ids.length;
    for (let bi = 0; bi < config.board_ids.length; bi++) {
      const trelloBoardId = config.board_ids[bi];
      const boardType = config.board_type_mapping[trelloBoardId] || 'dev';
      const boardLabel = `[Board ${bi + 1}/${totalBoards}]`;

      // 1. Import board
      await updateProgress(supabase, jobId, ++currentStep, totalSteps, 'importing_boards', `${boardLabel} Creating board...`);
      const mergeTarget = config.board_merge_targets?.[trelloBoardId];
      const boardTargetId = await importBoard(
        supabase, auth, jobId, trelloBoardId, boardType, userId, report, mergeTarget
      );
      await updateReport(supabase, jobId, report);

      if (!boardTargetId) continue;

      // 2. Import labels
      await updateProgress(supabase, jobId, ++currentStep, totalSteps, 'importing_labels', `${boardLabel} Importing labels...`);
      await importLabels(supabase, auth, jobId, trelloBoardId, boardTargetId, report);
      await updateReport(supabase, jobId, report);

      // 3. Import lists
      await updateProgress(supabase, jobId, ++currentStep, totalSteps, 'importing_lists', `${boardLabel} Importing lists...`);
      const listFilter = config.list_filter?.[trelloBoardId];
      await importLists(supabase, auth, jobId, trelloBoardId, boardTargetId, report, listFilter);
      await updateReport(supabase, jobId, report);

      // 4. Import cards
      await updateProgress(supabase, jobId, ++currentStep, totalSteps, 'importing_cards', `${boardLabel} Importing cards...`);
      await importCards(
        supabase, auth, jobId, trelloBoardId, boardTargetId, userId, config.user_mapping, report, listFilter
      );
      await updateReport(supabase, jobId, report);

      // 5. Import comments
      await updateProgress(supabase, jobId, ++currentStep, totalSteps, 'importing_comments', `${boardLabel} Importing comments...`);
      await importComments(
        supabase, auth, jobId, trelloBoardId, userId, config.user_mapping, report
      );
      await updateReport(supabase, jobId, report);

      // 6. Import attachments (per card)
      await updateProgress(supabase, jobId, ++currentStep, totalSteps, 'importing_attachments', `${boardLabel} Importing attachments...`);
      await importAttachments(supabase, auth, jobId, trelloBoardId, userId, report);
      await updateReport(supabase, jobId, report);

      // 6b. Resolve card covers from Trello's idAttachmentCover
      await updateDetail(supabase, jobId, `${boardLabel} Resolving card covers...`);
      await resolveCardCovers(supabase, auth, jobId, trelloBoardId, report);
      await updateReport(supabase, jobId, report);

      // 7. Import checklists (per card)
      await updateProgress(supabase, jobId, ++currentStep, totalSteps, 'importing_checklists', `${boardLabel} Importing checklists...`);
      await importChecklists(supabase, auth, jobId, trelloBoardId, report);
      await updateReport(supabase, jobId, report);
    }

    // Mark completed
    await supabase
      .from('migration_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: { current: totalSteps, total: totalSteps, phase: 'completed' },
        report,
      })
      .eq('id', jobId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    report.errors.push(`Fatal error: ${errorMessage}`);

    await supabase
      .from('migration_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        report,
      })
      .eq('id', jobId);
  }

  return report;
}

// ============================================================================
// IMPORT FUNCTIONS
// ============================================================================

async function importBoard(
  supabase: SupabaseClient,
  auth: TrelloAuth,
  jobId: string,
  trelloBoardId: string,
  boardType: BoardType,
  userId: string,
  report: MigrationReport,
  mergeTargetId?: string
): Promise<string | null> {
  try {
    // Check idempotency
    const existing = await getExistingMapping(supabase, jobId, 'board', trelloBoardId);
    if (existing) return existing;

    const trelloBoard = await fetchTrelloBoard(auth, trelloBoardId);

    // Explicit merge target from wizard - use it directly
    if (mergeTargetId) {
      const { data: targetBoard } = await supabase
        .from('boards')
        .select('id, name')
        .eq('id', mergeTargetId)
        .single();
      if (targetBoard) {
        await updateDetail(supabase, jobId, `Merging into existing board "${targetBoard.name}"`);
        await recordMapping(supabase, jobId, 'board', trelloBoardId, targetBoard.id, {
          original_name: trelloBoard.name,
          reused_existing: true,
        });
        report.boards_created++;
        return targetBoard.id;
      }
    }

    // Cross-job dedup: check if this Trello board was already imported in a previous job
    const globalBoardMappings = await getGlobalMappings(supabase, jobId, ['board']);
    if (globalBoardMappings.has(`board:${trelloBoardId}`)) {
      // Find the target board ID from the previous job's mapping
      const { data: prevMapping } = await supabase
        .from('migration_entity_map')
        .select('target_id')
        .eq('source_type', 'board')
        .eq('source_id', trelloBoardId)
        .neq('job_id', jobId)
        .limit(1)
        .single();
      if (prevMapping) {
        // Verify the target board still exists
        const { data: existsCheck } = await supabase
          .from('boards')
          .select('id, name')
          .eq('id', prevMapping.target_id)
          .single();
        if (existsCheck) {
          await updateDetail(supabase, jobId, `Reusing board "${existsCheck.name}" from previous migration`);
          await recordMapping(supabase, jobId, 'board', trelloBoardId, existsCheck.id, {
            original_name: trelloBoard.name,
            reused_existing: true,
          });
          report.boards_created++;
          return existsCheck.id;
        }
      }
    }

    // Check if a board with the same name already exists (merge into it)
    const { data: existingBoards } = await supabase
      .from('boards')
      .select('id, name')
      .or(`name.eq."${trelloBoard.name}",name.eq."[Migrated] ${trelloBoard.name}"`)
      .limit(1);

    if (existingBoards && existingBoards.length > 0) {
      const matchedBoard = existingBoards[0];
      await updateDetail(supabase, jobId, `Merging into existing board "${matchedBoard.name}" (${matchedBoard.id})`);
      await recordMapping(supabase, jobId, 'board', trelloBoardId, matchedBoard.id, {
        original_name: trelloBoard.name,
        reused_existing: true,
      });
      report.boards_created++;
      return matchedBoard.id;
    }

    // No existing board found - create a new one
    await updateDetail(supabase, jobId, `Creating board "${trelloBoard.name}"`);

    const { data: board, error } = await supabase
      .from('boards')
      .insert({
        name: trelloBoard.name,
        type: boardType,
        created_by: userId,
      })
      .select()
      .single();

    if (error || !board) {
      report.errors.push(`Failed to create board "${trelloBoard.name}": ${error?.message}`);
      return null;
    }

    await recordMapping(supabase, jobId, 'board', trelloBoardId, board.id, {
      original_name: trelloBoard.name,
    });

    report.boards_created++;
    return board.id;
  } catch (err) {
    report.errors.push(`Error importing board ${trelloBoardId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function importLabels(
  supabase: SupabaseClient,
  auth: TrelloAuth,
  jobId: string,
  trelloBoardId: string,
  targetBoardId: string,
  report: MigrationReport
): Promise<void> {
  try {
    const trelloLabels = await fetchTrelloLabels(auth, trelloBoardId);
    const existingLabelMappings = await batchGetMappings(supabase, jobId, ['label']);
    const globalLabelMappings = await getGlobalMappings(supabase, jobId, ['label']);
    await updateDetail(supabase, jobId, `Found ${trelloLabels.length} labels`);

    // Load existing labels on the target board for name-based matching
    const { data: boardLabels } = await supabase
      .from('labels')
      .select('id, name')
      .eq('board_id', targetBoardId);
    const labelsByName = new Map<string, string>();
    for (const bl of boardLabels || []) {
      labelsByName.set(bl.name.toLowerCase(), bl.id);
    }

    for (let li = 0; li < trelloLabels.length; li++) {
      const trelloLabel = trelloLabels[li];
      if (!trelloLabel.name && !trelloLabel.color) continue;

      if (existingLabelMappings.has(`label:${trelloLabel.id}`) || globalLabelMappings.has(`label:${trelloLabel.id}`)) continue;

      const labelName = trelloLabel.name || trelloLabel.color || 'Unlabeled';

      // Try to match to an existing label by name
      const matchedLabelId = labelsByName.get(labelName.toLowerCase());
      if (matchedLabelId) {
        await updateDetail(supabase, jobId, `Label ${li + 1}/${trelloLabels.length}: Mapping "${labelName}" to existing label`);
        await recordMapping(supabase, jobId, 'label', trelloLabel.id, matchedLabelId);
        report.labels_created++;
        continue;
      }

      // No match - create a new label
      await updateDetail(supabase, jobId, `Label ${li + 1}/${trelloLabels.length}: Creating "${labelName}"`);

      const { data: label, error } = await supabase
        .from('labels')
        .insert({
          name: labelName,
          color: mapTrelloColor(trelloLabel.color),
          board_id: targetBoardId,
        })
        .select()
        .single();

      if (error || !label) {
        report.errors.push(`Failed to create label "${trelloLabel.name}": ${error?.message}`);
        continue;
      }

      await recordMapping(supabase, jobId, 'label', trelloLabel.id, label.id);
      report.labels_created++;
    }
  } catch (err) {
    report.errors.push(`Error importing labels: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function importLists(
  supabase: SupabaseClient,
  auth: TrelloAuth,
  jobId: string,
  trelloBoardId: string,
  targetBoardId: string,
  report: MigrationReport,
  listFilter?: string[]
): Promise<void> {
  try {
    const trelloLists = await fetchTrelloLists(auth, trelloBoardId);
    let openLists = trelloLists.filter((l) => !l.closed);
    // Apply list filter if provided (only import selected lists)
    if (listFilter && listFilter.length > 0) {
      const allowedSet = new Set(listFilter);
      openLists = openLists.filter((l) => allowedSet.has(l.id));
    }
    const existingListMappings = await batchGetMappings(supabase, jobId, ['list']);
    const globalListMappings = await getGlobalMappings(supabase, jobId, ['list']);
    await updateDetail(supabase, jobId, `Found ${openLists.length} lists`);

    // Load existing lists on the target board for name-based matching
    const { data: boardLists } = await supabase
      .from('lists')
      .select('id, name')
      .eq('board_id', targetBoardId);
    const listsByName = new Map<string, string>();
    for (const bl of boardLists || []) {
      listsByName.set(bl.name.toLowerCase(), bl.id);
    }

    for (let i = 0; i < openLists.length; i++) {
      const trelloList = openLists[i];

      if (existingListMappings.has(`list:${trelloList.id}`) || globalListMappings.has(`list:${trelloList.id}`)) continue;

      // Try to match to an existing list by name
      const matchedListId = listsByName.get(trelloList.name.toLowerCase());
      if (matchedListId) {
        await updateDetail(supabase, jobId, `List ${i + 1}/${openLists.length}: Mapping "${trelloList.name}" to existing list`);
        await recordMapping(supabase, jobId, 'list', trelloList.id, matchedListId);
        report.lists_created++;
        continue;
      }

      // No match - create a new list
      await updateDetail(supabase, jobId, `List ${i + 1}/${openLists.length}: Creating "${trelloList.name}"`);

      const { data: list, error } = await supabase
        .from('lists')
        .insert({
          board_id: targetBoardId,
          name: trelloList.name,
          position: i,
        })
        .select()
        .single();

      if (error || !list) {
        report.errors.push(`Failed to create list "${trelloList.name}": ${error?.message}`);
        continue;
      }

      await recordMapping(supabase, jobId, 'list', trelloList.id, list.id);
      report.lists_created++;
    }
  } catch (err) {
    report.errors.push(`Error importing lists: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function importCards(
  supabase: SupabaseClient,
  auth: TrelloAuth,
  jobId: string,
  trelloBoardId: string,
  targetBoardId: string,
  userId: string,
  userMapping: Record<string, string>,
  report: MigrationReport,
  listFilter?: string[]
): Promise<void> {
  try {
    const trelloCards = await fetchTrelloCards(auth, trelloBoardId);
    const trelloLabels = await fetchTrelloLabels(auth, trelloBoardId);
    // Sort by list then by Trello position to preserve original card order
    let openCards = trelloCards.filter((c) => !c.closed).sort((a, b) => {
      if (a.idList !== b.idList) return a.idList.localeCompare(b.idList);
      return a.pos - b.pos;
    });
    // Filter cards to only include those on selected lists
    if (listFilter && listFilter.length > 0) {
      const allowedListSet = new Set(listFilter);
      openCards = openCards.filter((c) => allowedListSet.has(c.idList));
    }
    await updateDetail(supabase, jobId, `Found ${openCards.length} cards — checking already imported...`);

    // Batch-load all existing card + list + label mappings in one query each (avoids N+1)
    const existingMappings = await batchGetMappings(supabase, jobId, ['card', 'list', 'label']);
    // Cross-job dedup: skip cards imported by any previous job
    const globalCardMappings = await getGlobalMappings(supabase, jobId, ['card']);
    const skippedThisJob = openCards.filter((c) => existingMappings.has(`card:${c.id}`)).length;
    const skippedGlobal = openCards.filter((c) => globalCardMappings.has(`card:${c.id}`) && !existingMappings.has(`card:${c.id}`)).length;
    if (skippedThisJob > 0) {
      await updateDetail(supabase, jobId, `${skippedThisJob}/${openCards.length} cards already imported in this job — skipping`);
    }
    if (skippedGlobal > 0) {
      await updateDetail(supabase, jobId, `${skippedGlobal} cards already imported in previous jobs — skipping`);
    }

    // Track per-list position counters to preserve Trello card ordering
    const listPositionCounters = new Map<string, number>();

    for (let i = 0; i < openCards.length; i++) {
      const trelloCard = openCards[i];

      if (existingMappings.has(`card:${trelloCard.id}`) || globalCardMappings.has(`card:${trelloCard.id}`)) continue;

      // Update detail every 5 new cards for better progress visibility
      if (report.cards_created % 5 === 0) {
        await updateDetail(supabase, jobId, `Card ${i + 1}/${openCards.length}: "${trelloCard.name}"`);
      }

      try {
        // Find the target list
        const targetListId = existingMappings.get(`list:${trelloCard.idList}`) || null;
        if (!targetListId) {
          report.errors.push(`Card "${trelloCard.name}": target list not found for Trello list ${trelloCard.idList}`);
          continue;
        }

        const priority = inferPriority(trelloCard, trelloLabels);

        const { data: card, error } = await supabase
          .from('cards')
          .insert({
            title: trelloCard.name,
            description: trelloCard.desc || '',
            due_date: trelloCard.due,
            priority,
            created_by: userId,
          })
          .select()
          .single();

        if (error || !card) {
          report.errors.push(`Failed to create card "${trelloCard.name}": ${error?.message}`);
          continue;
        }

        // Create placement with per-list position preserving Trello order
        const listPos = listPositionCounters.get(targetListId) ?? 0;
        listPositionCounters.set(targetListId, listPos + 1);
        await supabase.from('card_placements').insert({
          card_id: card.id,
          list_id: targetListId,
          position: listPos,
          is_mirror: false,
        });

        // Map card labels
        for (const trelloLabelId of trelloCard.idLabels) {
          const targetLabelId = existingMappings.get(`label:${trelloLabelId}`) || null;
          if (targetLabelId) {
            await supabase.from('card_labels').insert({
              card_id: card.id,
              label_id: targetLabelId,
            });
          }
        }

        // Map card members to assignees
        for (const trelloMemberId of trelloCard.idMembers) {
          const mappedUserId = userMapping[trelloMemberId];
          if (mappedUserId && mappedUserId !== '__skip__') {
            await supabase.from('card_assignees').insert({
              card_id: card.id,
              user_id: mappedUserId,
            });
          }
        }

        await recordMapping(supabase, jobId, 'card', trelloCard.id, card.id, {
          original_name: trelloCard.name,
        });
        report.cards_created++;
      } catch (cardErr) {
        report.errors.push(`Card #${i + 1} "${trelloCard.name}": ${cardErr instanceof Error ? cardErr.message : String(cardErr)}`);
        // Continue with next card instead of aborting entire migration
      }

      // Save report every 25 cards so progress is visible in real time
      if (report.cards_created % 25 === 0) {
        await updateReport(supabase, jobId, report);
      }
    }
  } catch (err) {
    report.errors.push(`Fatal error importing cards: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function importComments(
  supabase: SupabaseClient,
  auth: TrelloAuth,
  jobId: string,
  trelloBoardId: string,
  userId: string,
  userMapping: Record<string, string>,
  report: MigrationReport
): Promise<void> {
  try {
    const trelloComments = await fetchTrelloComments(auth, trelloBoardId);
    await updateDetail(supabase, jobId, `Found ${trelloComments.length} comments — checking already imported...`);

    // Batch-load existing comment + card mappings (avoids N+1)
    const existingMappings = await batchGetMappings(supabase, jobId, ['comment', 'card']);
    const globalCommentMappings = await getGlobalMappings(supabase, jobId, ['comment']);
    const skipped = trelloComments.filter((c) => existingMappings.has(`comment:${c.id}`)).length;
    const skippedGlobal = trelloComments.filter((c) => globalCommentMappings.has(`comment:${c.id}`) && !existingMappings.has(`comment:${c.id}`)).length;
    if (skipped > 0) {
      await updateDetail(supabase, jobId, `${skipped}/${trelloComments.length} comments already imported — processing remaining`);
    }
    if (skippedGlobal > 0) {
      await updateDetail(supabase, jobId, `${skippedGlobal} comments from previous imports — skipping`);
    }

    let newCount = 0;
    for (let ci = 0; ci < trelloComments.length; ci++) {
      const trelloComment = trelloComments[ci];
      if (!trelloComment.data.card) continue;

      if (existingMappings.has(`comment:${trelloComment.id}`) || globalCommentMappings.has(`comment:${trelloComment.id}`)) continue;

      const targetCardId = existingMappings.get(`card:${trelloComment.data.card.id}`) || null;
      if (!targetCardId) continue;

      // Update detail every 10 new comments
      if (newCount % 10 === 0) {
        await updateDetail(supabase, jobId, `Comment ${ci + 1}/${trelloComments.length}`);
      }

      const mapped = userMapping[trelloComment.idMemberCreator];
      const commentUserId = (mapped && mapped !== '__skip__') ? mapped : userId;

      const { data: comment, error } = await supabase
        .from('comments')
        .insert({
          card_id: targetCardId,
          user_id: commentUserId,
          content: trelloComment.data.text,
        })
        .select()
        .single();

      if (error || !comment) {
        report.errors.push(`Failed to create comment: ${error?.message}`);
        continue;
      }

      await recordMapping(supabase, jobId, 'comment', trelloComment.id, comment.id);
      report.comments_created++;
      newCount++;

      if (report.comments_created % 25 === 0) {
        await updateReport(supabase, jobId, report);
      }
    }
  } catch (err) {
    report.errors.push(`Error importing comments: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * After attachments are imported, resolve Trello card covers.
 * Looks up each Trello card's `idAttachmentCover`, finds the imported attachment,
 * and sets `cards.cover_image_url` to its storage path.
 */
async function resolveCardCovers(
  supabase: SupabaseClient,
  auth: TrelloAuth,
  jobId: string,
  trelloBoardId: string,
  report: MigrationReport
) {
  try {
    const trelloCards = await fetchTrelloCards(auth, trelloBoardId);
    const cardsWithCovers = trelloCards.filter((c) => c.idAttachmentCover && !c.closed);

    if (cardsWithCovers.length === 0) {
      await updateDetail(supabase, jobId, 'No card covers to resolve');
      return;
    }

    await updateDetail(supabase, jobId, `Resolving ${cardsWithCovers.length} card covers...`);

    let resolved = 0;
    for (const trelloCard of cardsWithCovers) {
      // Find the target card in our DB
      const { data: cardMapping } = await supabase
        .from('migration_entity_map')
        .select('target_id')
        .eq('job_id', jobId)
        .eq('source_type', 'card')
        .eq('source_id', trelloCard.id)
        .limit(1)
        .single();

      if (!cardMapping) continue;

      // Find the target attachment in our DB
      const { data: attachmentMapping } = await supabase
        .from('migration_entity_map')
        .select('target_id')
        .eq('job_id', jobId)
        .eq('source_type', 'attachment')
        .eq('source_id', trelloCard.idAttachmentCover!)
        .limit(1)
        .single();

      if (!attachmentMapping) continue;

      // Get the attachment's storage path
      const { data: attachment } = await supabase
        .from('attachments')
        .select('storage_path, mime_type')
        .eq('id', attachmentMapping.target_id)
        .single();

      if (!attachment?.storage_path || !attachment.mime_type?.startsWith('image/')) continue;

      // Set the card's cover_image_url to this attachment's storage path
      await supabase
        .from('cards')
        .update({ cover_image_url: attachment.storage_path })
        .eq('id', cardMapping.target_id);

      resolved++;
    }

    await updateDetail(supabase, jobId, `Resolved ${resolved}/${cardsWithCovers.length} card covers`);
  } catch (err) {
    report.errors.push(`Error resolving card covers: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function importChecklists(
  supabase: SupabaseClient,
  auth: TrelloAuth,
  jobId: string,
  trelloBoardId: string,
  report: MigrationReport
): Promise<void> {
  try {
    const trelloCards = await fetchTrelloCards(auth, trelloBoardId);
    const cardsWithChecklists = trelloCards.filter(
      (c) => !c.closed && c.idChecklists.length > 0
    );
    await updateDetail(supabase, jobId, `${cardsWithChecklists.length} cards have checklists — checking already imported...`);

    // Batch-load existing card, checklist, and checklist_item mappings (avoids N+1)
    const existingMappings = await batchGetMappings(supabase, jobId, ['card', 'checklist', 'checklist_item']);
    const globalChecklistMappings = await getGlobalMappings(supabase, jobId, ['checklist', 'checklist_item']);

    let processedCards = 0;
    for (let ci = 0; ci < cardsWithChecklists.length; ci++) {
      const trelloCard = cardsWithChecklists[ci];
      const targetCardId = existingMappings.get(`card:${trelloCard.id}`) || null;
      if (!targetCardId) continue;

      // Update detail every 5 cards
      if (processedCards % 5 === 0) {
        await updateDetail(supabase, jobId, `Checklists for card ${ci + 1}/${cardsWithChecklists.length}: "${trelloCard.name}"`);
      }
      processedCards++;

      const trelloChecklists = await fetchTrelloChecklists(auth, trelloCard.id);

      for (let i = 0; i < trelloChecklists.length; i++) {
        const trelloChecklist = trelloChecklists[i];

        if (existingMappings.has(`checklist:${trelloChecklist.id}`) || globalChecklistMappings.has(`checklist:${trelloChecklist.id}`)) continue;

        const { data: checklist, error } = await supabase
          .from('checklists')
          .insert({
            card_id: targetCardId,
            title: trelloChecklist.name,
            position: i,
          })
          .select()
          .single();

        if (error || !checklist) {
          report.errors.push(`Failed to create checklist "${trelloChecklist.name}": ${error?.message}`);
          continue;
        }

        await recordMapping(supabase, jobId, 'checklist', trelloChecklist.id, checklist.id);
        report.checklists_created++;

        // Import checklist items
        for (let j = 0; j < trelloChecklist.checkItems.length; j++) {
          const item = trelloChecklist.checkItems[j];

          if (existingMappings.has(`checklist_item:${item.id}`) || globalChecklistMappings.has(`checklist_item:${item.id}`)) continue;

          const { data: checkItem, error: itemError } = await supabase
            .from('checklist_items')
            .insert({
              checklist_id: checklist.id,
              content: item.name,
              is_completed: item.state === 'complete',
              position: j,
            })
            .select()
            .single();

          if (checkItem) {
            await recordMapping(supabase, jobId, 'checklist_item', item.id, checkItem.id);
          } else if (itemError) {
            report.errors.push(`Failed to create checklist item: ${itemError.message}`);
          }
        }
      }

      if (report.checklists_created % 25 === 0 && report.checklists_created > 0) {
        await updateReport(supabase, jobId, report);
      }
    }
  } catch (err) {
    report.errors.push(`Error importing checklists: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Max file size for attachment download
// With S3: no practical limit (up to 5GB). Without S3: 50MB (Supabase free tier).
const MAX_ATTACHMENT_BYTES = 500 * 1024 * 1024; // 500MB absolute max

async function importAttachments(
  supabase: SupabaseClient,
  auth: TrelloAuth,
  jobId: string,
  trelloBoardId: string,
  userId: string,
  report: MigrationReport
): Promise<void> {
  try {
    // Batch-load existing card + attachment mappings (avoids N+1)
    const existingMappings = await batchGetMappings(supabase, jobId, ['card', 'attachment']);
    const globalAttachmentMappings = await getGlobalMappings(supabase, jobId, ['attachment']);

    // Pass 1: Try to load cached attachment manifest from DB first (avoids re-scanning Trello)
    const allAttachments: { card: TrelloCard; targetCardId: string; att: TrelloAttachment }[] = [];

    const { data: cachedManifest } = await supabase
      .from('migration_entity_map')
      .select('metadata')
      .eq('job_id', jobId)
      .eq('source_type', 'attachment_manifest')
      .eq('source_id', trelloBoardId)
      .single();

    if (cachedManifest?.metadata?.attachments?.length && cachedManifest.metadata.attachments.length > 0) {
      // Fast path: load from cache — no Trello API calls needed
      const cached = cachedManifest!.metadata.attachments as Array<{
        cardId: string; cardName: string; targetCardId: string; att: TrelloAttachment;
      }>;
      await updateDetail(supabase, jobId, `Loaded ${cached.length} attachments from cache (skipping Trello scan)`);
      for (const item of cached) {
        allAttachments.push({
          card: { id: item.cardId, name: item.cardName } as TrelloCard,
          targetCardId: item.targetCardId,
          att: item.att,
        });
      }
    } else {
      // Slow path: first run — scan Trello and cache the results
      const trelloCards = await fetchTrelloCards(auth, trelloBoardId);
      const openCards = trelloCards.filter((c) => !c.closed);
      await updateDetail(supabase, jobId, `Scanning ${openCards.length} cards for attachments...`);

      let scanned = 0;
      for (const trelloCard of openCards) {
        scanned++;
        const targetCardId = existingMappings.get(`card:${trelloCard.id}`) || null;
        if (!targetCardId) continue;

        if (scanned % 25 === 0) {
          await updateDetail(supabase, jobId, `Scanning card ${scanned}/${openCards.length} for attachments — ${allAttachments.length} found so far`);
        }

        let trelloAttachments: TrelloAttachment[];
        try {
          trelloAttachments = await fetchTrelloAttachments(auth, trelloCard.id);
        } catch {
          report.errors.push(`Failed to fetch attachments for card "${trelloCard.name}"`);
          continue;
        }

        for (const att of trelloAttachments) {
          if (!att.url || att.bytes === 0) continue;
          allAttachments.push({ card: trelloCard, targetCardId, att });
        }
      }

      // Cache the manifest to DB so re-runs skip the scan entirely
      const manifestData = allAttachments.map((a) => ({
        cardId: a.card.id,
        cardName: a.card.name,
        targetCardId: a.targetCardId,
        att: a.att,
      }));
      await supabase.from('migration_entity_map').upsert(
        {
          job_id: jobId,
          source_type: 'attachment_manifest',
          source_id: trelloBoardId,
          target_id: '00000000-0000-0000-0000-000000000000',
          metadata: { attachments: manifestData },
        },
        { onConflict: 'job_id,source_type,source_id' }
      );
      await updateDetail(supabase, jobId, `Cached ${allAttachments.length} attachments for future re-runs`);
    }

    const totalAttachments = allAttachments.length;
    // Filter down to only unimported attachments — skip successes entirely
    const pendingAttachments = allAttachments.filter((a) => !existingMappings.has(`attachment:${a.att.id}`) && !globalAttachmentMappings.has(`attachment:${a.att.id}`));
    const alreadyImported = totalAttachments - pendingAttachments.length;
    await updateDetail(supabase, jobId, `Found ${totalAttachments} total (${alreadyImported} done, ${pendingAttachments.length} remaining — retrying failures only)`);

    // Pass 2: Process ONLY pending attachments (failures + never-attempted)
    let current = 0;
    for (const { card: trelloCard, targetCardId, att } of pendingAttachments) {
      current++;

      const sizeMB = att.bytes > 0 ? `${(att.bytes / 1024 / 1024).toFixed(1)}MB` : '';
      await updateDetail(supabase, jobId, `Attachment ${current}/${pendingAttachments.length}: "${att.name}" ${sizeMB}`);

      // Skip files over our absolute max (100MB) unless S3 is configured
      if (att.bytes > MAX_ATTACHMENT_BYTES && !isS3Configured()) {
        report.errors.push(
          `Skipped attachment "${att.name}" on card "${trelloCard.name}" — ${Math.round(att.bytes / 1024 / 1024)}MB exceeds ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB limit (configure AWS S3 for large files)`
        );
        continue;
      }

      try {
        // Only download Trello-hosted files; skip external links (Google Drive, websites, etc.)
        const isTrelloHosted = att.url.includes('trello.com') || att.url.includes('trello-attachments');
        if (!isTrelloHosted) {
          // Record link-type attachments as metadata-only (no file download)
          const { data: linkAtt, error: linkErr } = await supabase
            .from('attachments')
            .insert({
              card_id: targetCardId,
              file_name: att.name || att.url,
              file_size: 0,
              mime_type: 'text/uri-list',
              storage_path: att.url,
              uploaded_by: userId,
            })
            .select()
            .single();

          if (linkAtt) {
            await recordMapping(supabase, jobId, 'attachment', att.id, linkAtt.id, {
              original_name: att.name,
              is_link: true,
            });
            report.attachments_created++;
          }
          continue;
        }

        // Download file via Trello's API download endpoint (not the raw S3 URL).
        // Raw S3 URLs return 401; the API endpoint handles auth properly.
        const downloadFileName = att.fileName || att.name;
        const downloadUrl = `https://api.trello.com/1/cards/${trelloCard.id}/attachments/${att.id}/download/${encodeURIComponent(downloadFileName)}`;
        let fileRes: Response;
        try {
          fileRes = await fetch(downloadUrl, {
            headers: {
              'Authorization': `OAuth oauth_consumer_key="${auth.key}", oauth_token="${auth.token}"`,
            },
            signal: AbortSignal.timeout(60000),
          });
        } catch (fetchErr: any) {
          report.errors.push(`Failed to download "${att.name}": ${fetchErr.message}`);
          continue;
        }
        if (!fileRes.ok) {
          report.errors.push(`Failed to download "${att.name}" from Trello (HTTP ${fileRes.status})`);
          continue;
        }

        const fileBuffer = await fileRes.arrayBuffer();
        const actualSize = fileBuffer.byteLength;
        // Sanitize filename for Supabase Storage — strip quotes, special chars, em-dashes
        const safeName = att.name
          .replace(/["""'']/g, '')
          .replace(/[–—]/g, '-')
          .replace(/[^a-zA-Z0-9._\-() ]/g, '_')
          .replace(/\s+/g, '_')
          .substring(0, 200);
        const storagePath = `${targetCardId}/${Date.now()}_${safeName}`;

        // Decide storage backend: S3 for large files, Supabase Storage for small
        const SUPABASE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
        const useS3 = actualSize > SUPABASE_SIZE_LIMIT && isS3Configured();
        let finalStoragePath: string;

        if (useS3) {
          // Upload to AWS S3 — prefix with "s3://" so we know to generate presigned URLs
          const s3Key = buildS3Key(targetCardId, safeName);
          try {
            await uploadToS3(s3Key, Buffer.from(fileBuffer), att.mimeType || 'application/octet-stream');
            finalStoragePath = `s3://${s3Key}`;
          } catch (s3Err: any) {
            report.errors.push(`Failed to upload "${att.name}" to S3: ${s3Err.message}`);
            continue;
          }
        } else if (actualSize <= SUPABASE_SIZE_LIMIT) {
          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from('card-attachments')
            .upload(storagePath, fileBuffer, {
              contentType: att.mimeType || 'application/octet-stream',
              upsert: false,
            });

          if (uploadError) {
            report.errors.push(`Failed to upload "${att.name}": ${uploadError.message}`);
            continue;
          }
          finalStoragePath = storagePath;
        } else {
          // File is > 50MB but S3 not configured — skip
          report.errors.push(
            `Skipped "${att.name}" (${Math.round(actualSize / 1024 / 1024)}MB) — too large for Supabase, S3 not configured`
          );
          continue;
        }

        // Create attachment record in DB
        const { data: attachment, error: dbError } = await supabase
          .from('attachments')
          .insert({
            card_id: targetCardId,
            file_name: att.name,
            file_size: actualSize || att.bytes || 0,
            mime_type: att.mimeType || 'application/octet-stream',
            storage_path: finalStoragePath,
            uploaded_by: userId,
          })
          .select()
          .single();

        if (dbError || !attachment) {
          report.errors.push(`Failed to save attachment record "${att.name}": ${dbError?.message}`);
          continue;
        }

        await recordMapping(supabase, jobId, 'attachment', att.id, attachment.id, {
          original_name: att.name,
          file_size: actualSize || att.bytes || 0,
        });
        report.attachments_created++;
      } catch (err) {
        report.errors.push(
          `Error processing attachment "${att.name}" on card "${trelloCard.name}": ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // Save report every 25 processed attachments (successes + errors)
      if (current % 25 === 0) {
        await updateReport(supabase, jobId, report);
      }
    }
  } catch (err) {
    report.errors.push(`Error importing attachments: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Backfill attachments for an already-completed migration job.
 * Uses existing card mappings to find which Trello cards have already been imported,
 * then downloads and attaches any files that weren't migrated originally.
 */
export async function backfillAttachments(
  supabase: SupabaseClient,
  jobId: string,
  config: MigrationJobConfig,
  userId: string
): Promise<MigrationReport> {
  const auth: TrelloAuth = { key: config.trello_api_key, token: config.trello_token };

  // Load existing report so counters carry forward
  const { data: existingJob } = await supabase
    .from('migration_jobs')
    .select('report')
    .eq('id', jobId)
    .single();
  const prev = existingJob?.report as MigrationReport | null;

  const report: MigrationReport = {
    boards_created: prev?.boards_created ?? 0,
    lists_created: prev?.lists_created ?? 0,
    cards_created: prev?.cards_created ?? 0,
    comments_created: prev?.comments_created ?? 0,
    attachments_created: prev?.attachments_created ?? 0,
    labels_created: prev?.labels_created ?? 0,
    checklists_created: prev?.checklists_created ?? 0,
    errors: [],  // Fresh errors for this backfill run
  };

  // Write initial progress so UI can show it immediately
  _cachedProgress = { current: 0, total: config.board_ids.length, phase: 'backfilling_attachments', detail: 'Starting attachment backfill...' };
  await supabase
    .from('migration_jobs')
    .update({ progress: _cachedProgress })
    .eq('id', jobId);

  const totalBoards = config.board_ids.length;
  for (let bi = 0; bi < config.board_ids.length; bi++) {
    const trelloBoardId = config.board_ids[bi];
    await updateProgress(supabase, jobId, bi + 1, totalBoards, 'backfilling_attachments', `[Board ${bi + 1}/${totalBoards}] Scanning...`);
    await importAttachments(supabase, auth, jobId, trelloBoardId, userId, report);
    await updateReport(supabase, jobId, report);
  }

  // Clear progress to signal completion
  await supabase
    .from('migration_jobs')
    .update({
      progress: { current: totalBoards, total: totalBoards, phase: 'backfill_complete', detail: `Done — ${report.attachments_created} attachments imported` },
      report,
    })
    .eq('id', jobId);

  return report;
}
