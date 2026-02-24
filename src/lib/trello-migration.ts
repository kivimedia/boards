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
// CONCURRENCY UTILITIES
// ============================================================================

function createSemaphore(limit: number) {
  let current = 0;
  const queue: (() => void)[] = [];
  return {
    async acquire() {
      if (current < limit) {
        current++;
        return;
      }
      await new Promise<void>((resolve) => queue.push(resolve));
    },
    release() {
      current--;
      if (queue.length > 0) {
        current++;
        queue.shift()!();
      }
    },
  };
}

async function batchRecordMappings(
  supabase: SupabaseClient,
  jobId: string,
  entries: { sourceType: MigrationEntityType; sourceId: string; targetId: string; metadata?: Record<string, unknown> }[]
): Promise<void> {
  if (entries.length === 0) return;
  await supabase.from('migration_entity_map').insert(
    entries.map((e) => ({
      job_id: jobId,
      source_type: e.sourceType,
      source_id: e.sourceId,
      target_id: e.targetId,
      metadata: e.metadata || {},
    }))
  );
}

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
        const retryAfter = parseInt(res.headers.get('retry-after') || '10', 10) || 10;
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
  const allComments: TrelloComment[] = [];
  let before: string | undefined;

  // Paginate through all comments using the `before` cursor (Trello returns newest first)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params: Record<string, string> = { filter: 'commentCard', limit: '1000' };
    if (before) params.before = before;

    const page = await trelloFetch<TrelloComment[]>(`/boards/${boardId}/actions`, auth, params);
    if (!page || page.length === 0) break;

    allComments.push(...page);

    // If we got fewer than 1000, we've exhausted all comments
    if (page.length < 1000) break;

    // Use the last comment's ID as the cursor for the next page
    before = page[page.length - 1].id;
  }

  return allComments;
}

export async function fetchTrelloChecklists(auth: TrelloAuth, cardId: string): Promise<TrelloChecklist[]> {
  return trelloFetch<TrelloChecklist[]>(`/cards/${cardId}/checklists`, auth);
}

export async function fetchTrelloAttachments(auth: TrelloAuth, cardId: string): Promise<TrelloAttachment[]> {
  return trelloFetch<TrelloAttachment[]>(`/cards/${cardId}/attachments`, auth);
}

// ============================================================================
// TRELLO RESPONSE CACHE (cleared per migration run)
// ============================================================================

const _trelloResponseCache = new Map<string, unknown>();

function clearTrelloCache() {
  _trelloResponseCache.clear();
}

async function cachedFetchTrelloCards(auth: TrelloAuth, boardId: string): Promise<TrelloCard[]> {
  const key = `cards:${boardId}`;
  if (_trelloResponseCache.has(key)) return _trelloResponseCache.get(key) as TrelloCard[];
  const result = await fetchTrelloCards(auth, boardId);
  _trelloResponseCache.set(key, result);
  return result;
}

async function cachedFetchTrelloLabels(auth: TrelloAuth, boardId: string): Promise<TrelloLabel[]> {
  const key = `labels:${boardId}`;
  if (_trelloResponseCache.has(key)) return _trelloResponseCache.get(key) as TrelloLabel[];
  const result = await fetchTrelloLabels(auth, boardId);
  _trelloResponseCache.set(key, result);
  return result;
}

async function cachedFetchTrelloLists(auth: TrelloAuth, boardId: string): Promise<TrelloList[]> {
  const key = `lists:${boardId}`;
  if (_trelloResponseCache.has(key)) return _trelloResponseCache.get(key) as TrelloList[];
  const result = await fetchTrelloLists(auth, boardId);
  _trelloResponseCache.set(key, result);
  return result;
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
 * Like getGlobalMappings but returns Map<sourceKey, targetId> instead of Set.
 * Used in merge mode to resolve target UUIDs for entities imported by previous jobs.
 */
async function getGlobalMappingsWithTargets(
  supabase: SupabaseClient,
  currentJobId: string,
  sourceTypes: MigrationEntityType[]
): Promise<Map<string, string>> {
  const globalMap = new Map<string, string>();
  for (const sourceType of sourceTypes) {
    let offset = 0;
    const pageSize = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data } = await supabase
        .from('migration_entity_map')
        .select('source_id, target_id')
        .eq('source_type', sourceType)
        .neq('job_id', currentJobId)
        .range(offset, offset + pageSize - 1);
      if (!data || data.length === 0) break;
      for (const row of data) {
        globalMap.set(`${sourceType}:${row.source_id}`, row.target_id);
      }
      if (data.length < pageSize) break;
      offset += pageSize;
    }
  }
  return globalMap;
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
let _lastDetailWrite = 0;

async function updateDetail(
  supabase: SupabaseClient,
  jobId: string,
  detail: string
): Promise<void> {
  const now = Date.now();
  if (now - _lastDetailWrite < 1000) return; // Throttle: max 1 write/sec
  _lastDetailWrite = now;
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
 * This processes boards in order: boards → labels → lists → cards → attachments+covers → comments+checklists
 *
 * @param deadline - Unix timestamp (ms). When approaching this time, the migration saves progress and exits
 *                   gracefully so it can be resumed in a new function invocation. Pass 0 for no deadline.
 * @returns The report, plus `needs_resume: true` on the report if the deadline was reached before completion.
 */
export async function runMigration(
  supabase: SupabaseClient,
  jobId: string,
  config: MigrationJobConfig,
  userId: string,
  deadline = 0
): Promise<MigrationReport & { needs_resume?: boolean }> {
  const auth: TrelloAuth = { key: config.trello_api_key, token: config.trello_token };
  clearTrelloCache();
  _lastDetailWrite = 0;

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

  const mergeMode = config.sync_mode === 'merge';

  const report: MigrationReport = {
    boards_created: boards,
    lists_created: lists,
    cards_created: cards,
    cards_updated: 0,
    comments_created: comments,
    attachments_created: attachments,
    labels_created: labels,
    checklists_created: checklists,
    checklist_items_updated: 0,
    placements_removed: 0,
    covers_resolved: 0,
    positions_synced: 0,
    errors: [],
  };

  // Deadline helper: returns true when we're within 30s of the deadline
  const isNearDeadline = () => deadline > 0 && Date.now() > deadline - 30_000;

  // Mark job as running and save accurate report immediately
  await supabase
    .from('migration_jobs')
    .update({ status: 'running', started_at: new Date().toISOString(), report })
    .eq('id', jobId);

  try {
    const totalSteps = config.board_ids.length * 6; // 6 phases per board (comments+checklists parallel)
    let currentStep = 0;

    const totalBoards = config.board_ids.length;
    let hitDeadline = false;

    for (let bi = 0; bi < config.board_ids.length; bi++) {
      const trelloBoardId = config.board_ids[bi];
      const boardType = config.board_type_mapping[trelloBoardId] || 'general_tasks';
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
      if (isNearDeadline()) { hitDeadline = true; currentStep += 3; break; }
      await updateProgress(supabase, jobId, ++currentStep, totalSteps, 'importing_cards', `${boardLabel} Importing cards...`);
      await importCards(
        supabase, auth, jobId, trelloBoardId, boardTargetId, userId, config.user_mapping, report, listFilter, mergeMode, deadline
      );
      await updateReport(supabase, jobId, report);

      // 5. Import attachments + resolve covers
      if (isNearDeadline()) { hitDeadline = true; currentStep += 2; break; }
      await updateProgress(supabase, jobId, ++currentStep, totalSteps, 'importing_attachments', `${boardLabel} Importing attachments...`);
      await importAttachments(supabase, auth, jobId, trelloBoardId, userId, report, mergeMode, deadline, listFilter);
      await updateReport(supabase, jobId, report);

      // Check if importAttachments bailed early due to deadline
      if (isNearDeadline()) { hitDeadline = true; currentStep += 1; break; }

      // 5b. Resolve card covers from Trello's idAttachmentCover
      await updateDetail(supabase, jobId, `${boardLabel} Resolving card covers...`);
      await resolveCardCovers(supabase, auth, jobId, trelloBoardId, report, listFilter);
      await updateReport(supabase, jobId, report);

      // 6. Import comments + checklists in parallel (both only need card mappings)
      if (isNearDeadline()) { hitDeadline = true; currentStep += 1; break; }
      await updateProgress(supabase, jobId, ++currentStep, totalSteps, 'importing_comments_checklists', `${boardLabel} Importing comments + checklists...`);
      await Promise.all([
        importComments(supabase, auth, jobId, trelloBoardId, userId, config.user_mapping, report, mergeMode),
        importChecklists(supabase, auth, jobId, trelloBoardId, report, mergeMode, listFilter),
      ]);
      await updateReport(supabase, jobId, report);
    }

    if (hitDeadline) {
      // Save progress and mark for auto-resume (job stays "running" with needs_resume flag)
      const resumeReport = { ...report, needs_resume: true } as any;
      await supabase
        .from('migration_jobs')
        .update({
          status: 'pending',
          progress: { ..._cachedProgress, current: currentStep, total: totalSteps, detail: 'Auto-resuming in a few seconds...', needs_resume: true },
          report: resumeReport,
        })
        .eq('id', jobId);
      return { ...report, needs_resume: true };
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
    const trelloLabels = await cachedFetchTrelloLabels(auth, trelloBoardId);
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
    const trelloLists = await cachedFetchTrelloLists(auth, trelloBoardId);
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
  listFilter?: string[],
  mergeMode = false,
  deadline = 0
): Promise<void> {
  try {
    const trelloCards = await cachedFetchTrelloCards(auth, trelloBoardId);
    const trelloLabels = await cachedFetchTrelloLabels(auth, trelloBoardId);
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
    // Cross-job dedup: check cards imported by any previous job
    // Always use WithTargets (returns Map) so we can resolve target IDs in merge mode
    const globalCardMappings = await getGlobalMappingsWithTargets(supabase, jobId, ['card']);
    // In merge mode, also load global label mappings for re-syncing labels on existing cards
    const globalLabelMap = mergeMode
      ? await getGlobalMappingsWithTargets(supabase, jobId, ['label'])
      : new Map<string, string>();
    const globalListMap = mergeMode
      ? await getGlobalMappingsWithTargets(supabase, jobId, ['list'])
      : new Map<string, string>();

    const skippedThisJob = openCards.filter((c) => existingMappings.has(`card:${c.id}`)).length;
    const skippedGlobal = openCards.filter((c) => globalCardMappings.has(`card:${c.id}`) && !existingMappings.has(`card:${c.id}`)).length;
    if (skippedThisJob > 0) {
      await updateDetail(supabase, jobId, `${skippedThisJob}/${openCards.length} cards already imported in this job${mergeMode ? ' — will update' : ' — skipping'}`);
    }
    if (skippedGlobal > 0) {
      await updateDetail(supabase, jobId, `${skippedGlobal} cards from previous jobs${mergeMode ? ' — will update' : ' — skipping'}`);
    }

    // Track per-list position counters to preserve Trello card ordering
    const listPositionCounters = new Map<string, number>();

    const nearDeadline = () => deadline > 0 && Date.now() > deadline - 30_000;

    // Pass 1: Handle merge-mode updates with concurrency, collect new cards for batch insert
    type BatchCardItem = { trelloCard: TrelloCard; targetListId: string; listPos: number; priority: string };
    const newCardsToInsert: BatchCardItem[] = [];

    // Separate cards into merge vs new
    type MergeCardItem = { trelloCard: TrelloCard; targetCardId: string; index: number };
    const mergeCards: MergeCardItem[] = [];

    for (let i = 0; i < openCards.length; i++) {
      const trelloCard = openCards[i];

      const mappedInThisJob = existingMappings.get(`card:${trelloCard.id}`);
      const mappedGlobally = globalCardMappings.get(`card:${trelloCard.id}`);
      const alreadyImported = mappedInThisJob || mappedGlobally;

      if (alreadyImported && !mergeMode) continue;

      if (alreadyImported && mergeMode) {
        const targetCardId = mappedInThisJob || (mappedGlobally as string);
        mergeCards.push({ trelloCard, targetCardId, index: i });
        continue;
      }

      // --- Fresh: collect for batch INSERT ---
      const targetListId = existingMappings.get(`list:${trelloCard.idList}`) || globalListMap.get(`list:${trelloCard.idList}`) || null;
      if (!targetListId) {
        report.errors.push(`Card "${trelloCard.name}": target list not found for Trello list ${trelloCard.idList}`);
        continue;
      }

      const priority = inferPriority(trelloCard, trelloLabels);
      const listPos = listPositionCounters.get(targetListId) ?? 0;
      listPositionCounters.set(targetListId, listPos + 1);
      newCardsToInsert.push({ trelloCard, targetListId, listPos, priority });
    }

    // Process merge cards with concurrency (semaphore of 6)
    if (mergeCards.length > 0) {
      const mergeSem = createSemaphore(6);
      let mergeProcessed = 0;

      const MERGE_BATCH = 50;
      for (let bStart = 0; bStart < mergeCards.length; bStart += MERGE_BATCH) {
        if (nearDeadline()) break; // Bail for auto-resume

        const mBatch = mergeCards.slice(bStart, bStart + MERGE_BATCH);
        await updateDetail(supabase, jobId, `Merging cards ${bStart + 1}-${Math.min(bStart + MERGE_BATCH, mergeCards.length)}/${mergeCards.length}...`);

        await Promise.all(mBatch.map(async ({ trelloCard, targetCardId }) => {
          await mergeSem.acquire();
          try {
            const priority = inferPriority(trelloCard, trelloLabels);

            // Update card fields
            await supabase
              .from('cards')
              .update({ title: trelloCard.name, description: trelloCard.desc || '', due_date: trelloCard.due, priority })
              .eq('id', targetCardId);

            // Re-sync list placement: move card if its Trello list changed
            const targetListId = existingMappings.get(`list:${trelloCard.idList}`) || globalListMap.get(`list:${trelloCard.idList}`) || null;
            if (targetListId) {
              const { data: currentPlacement } = await supabase
                .from('card_placements')
                .select('id, list_id')
                .eq('card_id', targetCardId)
                .eq('is_mirror', false)
                .limit(1)
                .single();
              if (currentPlacement && currentPlacement.list_id !== targetListId) {
                await supabase
                  .from('card_placements')
                  .update({ list_id: targetListId })
                  .eq('id', currentPlacement.id);
              }
            }

            // Re-sync labels: delete old, add current
            await supabase.from('card_labels').delete().eq('card_id', targetCardId);
            const labelInserts = trelloCard.idLabels
              .map((lid) => existingMappings.get(`label:${lid}`) || globalLabelMap.get(`label:${lid}`) || null)
              .filter(Boolean)
              .map((labelId) => ({ card_id: targetCardId, label_id: labelId as string }));
            if (labelInserts.length > 0) await supabase.from('card_labels').insert(labelInserts);

            // Re-sync assignees: delete old, add current
            await supabase.from('card_assignees').delete().eq('card_id', targetCardId);
            const assigneeInserts = trelloCard.idMembers
              .map((mid) => userMapping[mid])
              .filter((mu) => mu && mu !== '__skip__')
              .map((mu) => ({ card_id: targetCardId, user_id: mu }));
            if (assigneeInserts.length > 0) await supabase.from('card_assignees').insert(assigneeInserts);

            report.cards_updated++;
          } catch (mergeErr) {
            report.errors.push(`Merge card "${trelloCard.name}": ${mergeErr instanceof Error ? mergeErr.message : String(mergeErr)}`);
          } finally {
            mergeSem.release();
          }
        }));

        mergeProcessed += mBatch.length;
        await updateReport(supabase, jobId, report);
      }

      // Pass 1B: Sync positions to match Trello order
      if (!nearDeadline()) {
        await updateDetail(supabase, jobId, 'Syncing card positions to match Trello order...');
        const posSem = createSemaphore(10);
        // Group openCards by Trello list (already sorted by pos within each list)
        const cardsByTrelloList = new Map<string, TrelloCard[]>();
        for (const tc of openCards) {
          const group = cardsByTrelloList.get(tc.idList) || [];
          group.push(tc);
          cardsByTrelloList.set(tc.idList, group);
        }
        for (const [trelloListId, cardsInList] of Array.from(cardsByTrelloList.entries())) {
          const targetListId = existingMappings.get(`list:${trelloListId}`) || globalListMap.get(`list:${trelloListId}`);
          if (!targetListId) continue;
          await Promise.all(cardsInList.map(async (tc: TrelloCard, posIndex: number) => {
            const targetCardId = existingMappings.get(`card:${tc.id}`) || globalCardMappings.get(`card:${tc.id}`);
            if (!targetCardId) return;
            await posSem.acquire();
            try {
              await supabase
                .from('card_placements')
                .update({ position: posIndex })
                .eq('card_id', targetCardId)
                .eq('list_id', targetListId)
                .eq('is_mirror', false);
              report.positions_synced++;
            } finally {
              posSem.release();
            }
          }));
        }
        await updateReport(supabase, jobId, report);
        await updateDetail(supabase, jobId, `Synced ${report.positions_synced} card positions`);
      }

      // Pass 1C: Remove stale placements (cards moved/deleted on Trello)
      if (!nearDeadline()) {
        await updateDetail(supabase, jobId, 'Removing stale card placements...');
        // Build expected card IDs per target list from Trello openCards
        const expectedByList = new Map<string, Set<string>>();
        for (const tc of openCards) {
          const targetListId = existingMappings.get(`list:${tc.idList}`) || globalListMap.get(`list:${tc.idList}`);
          if (!targetListId) continue;
          const targetCardId = existingMappings.get(`card:${tc.id}`) || globalCardMappings.get(`card:${tc.id}`);
          if (!targetCardId) continue;
          if (!expectedByList.has(targetListId)) expectedByList.set(targetListId, new Set());
          expectedByList.get(targetListId)!.add(targetCardId);
        }
        for (const [targetListId, expectedCardIds] of Array.from(expectedByList.entries())) {
          // Fetch all non-mirror placements in this list
          const { data: placements } = await supabase
            .from('card_placements')
            .select('id, card_id')
            .eq('list_id', targetListId)
            .eq('is_mirror', false);
          if (!placements) continue;
          const staleIds = placements
            .filter((p) => !expectedCardIds.has(p.card_id))
            .map((p) => p.id);
          if (staleIds.length > 0) {
            // Delete in chunks of 200 for .in() limit
            for (let i = 0; i < staleIds.length; i += 200) {
              await supabase.from('card_placements').delete().in('id', staleIds.slice(i, i + 200));
            }
            report.placements_removed += staleIds.length;
          }
        }
        await updateReport(supabase, jobId, report);
        await updateDetail(supabase, jobId, `Removed ${report.placements_removed} stale placements`);
      }
    }

    // Pass 2: Batch insert new cards in groups of 50
    const CARD_BATCH_SIZE = 50;
    for (let batchStart = 0; batchStart < newCardsToInsert.length; batchStart += CARD_BATCH_SIZE) {
      if (nearDeadline()) break; // Bail for auto-resume
      const batch = newCardsToInsert.slice(batchStart, batchStart + CARD_BATCH_SIZE);
      const batchEnd = Math.min(batchStart + CARD_BATCH_SIZE, newCardsToInsert.length);
      await updateDetail(supabase, jobId, `Inserting cards ${batchStart + 1}-${batchEnd}/${newCardsToInsert.length}...`);

      try {
        const { data: insertedCards, error: batchErr } = await supabase
          .from('cards')
          .insert(batch.map(({ trelloCard, priority }) => ({
            title: trelloCard.name,
            description: trelloCard.desc || '',
            due_date: trelloCard.due,
            priority,
            created_by: userId,
          })))
          .select();

        if (batchErr || !insertedCards) {
          // Fallback: individual inserts for this batch
          report.errors.push(`Batch insert failed (${batchStart + 1}-${batchEnd}): ${batchErr?.message} — falling back to individual`);
          for (const { trelloCard, targetListId, listPos, priority } of batch) {
            try {
              const { data: card, error } = await supabase
                .from('cards')
                .insert({ title: trelloCard.name, description: trelloCard.desc || '', due_date: trelloCard.due, priority, created_by: userId })
                .select().single();
              if (error || !card) { report.errors.push(`Failed to create card "${trelloCard.name}": ${error?.message}`); continue; }
              await supabase.from('card_placements').insert({ card_id: card.id, list_id: targetListId, position: listPos, is_mirror: false });
              for (const lid of trelloCard.idLabels) {
                const tlid = existingMappings.get(`label:${lid}`) || globalLabelMap.get(`label:${lid}`);
                if (tlid) await supabase.from('card_labels').insert({ card_id: card.id, label_id: tlid });
              }
              for (const mid of trelloCard.idMembers) {
                const mu = userMapping[mid];
                if (mu && mu !== '__skip__') await supabase.from('card_assignees').insert({ card_id: card.id, user_id: mu });
              }
              await recordMapping(supabase, jobId, 'card', trelloCard.id, card.id, { original_name: trelloCard.name });
              report.cards_created++;
            } catch (cardErr) {
              report.errors.push(`Card "${trelloCard.name}": ${cardErr instanceof Error ? cardErr.message : String(cardErr)}`);
            }
          }
          await updateReport(supabase, jobId, report);
          continue;
        }

        // Batch succeeded — build placements, labels, assignees, mappings
        const placements: { card_id: string; list_id: string; position: number; is_mirror: boolean }[] = [];
        const labelInserts: { card_id: string; label_id: string }[] = [];
        const assigneeInserts: { card_id: string; user_id: string }[] = [];
        const mappingEntries: { sourceType: MigrationEntityType; sourceId: string; targetId: string; metadata: Record<string, unknown> }[] = [];

        for (let j = 0; j < insertedCards.length; j++) {
          const card = insertedCards[j];
          const { trelloCard, targetListId, listPos } = batch[j];
          placements.push({ card_id: card.id, list_id: targetListId, position: listPos, is_mirror: false });
          for (const lid of trelloCard.idLabels) {
            const tlid = existingMappings.get(`label:${lid}`) || globalLabelMap.get(`label:${lid}`);
            if (tlid) labelInserts.push({ card_id: card.id, label_id: tlid });
          }
          for (const mid of trelloCard.idMembers) {
            const mu = userMapping[mid];
            if (mu && mu !== '__skip__') assigneeInserts.push({ card_id: card.id, user_id: mu });
          }
          mappingEntries.push({ sourceType: 'card', sourceId: trelloCard.id, targetId: card.id, metadata: { original_name: trelloCard.name } });
        }

        if (placements.length > 0) await supabase.from('card_placements').insert(placements);
        if (labelInserts.length > 0) await supabase.from('card_labels').insert(labelInserts);
        if (assigneeInserts.length > 0) await supabase.from('card_assignees').insert(assigneeInserts);
        await batchRecordMappings(supabase, jobId, mappingEntries);

        report.cards_created += insertedCards.length;
        await updateReport(supabase, jobId, report);
      } catch (batchCatchErr) {
        report.errors.push(`Error in card batch ${batchStart + 1}-${batchEnd}: ${batchCatchErr instanceof Error ? batchCatchErr.message : String(batchCatchErr)}`);
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
  report: MigrationReport,
  mergeMode = false
): Promise<void> {
  try {
    const trelloComments = await fetchTrelloComments(auth, trelloBoardId);
    await updateDetail(supabase, jobId, `Found ${trelloComments.length} comments — checking already imported...`);

    // Batch-load existing comment + card mappings (avoids N+1)
    const existingMappings = await batchGetMappings(supabase, jobId, ['comment', 'card']);
    const globalCommentMappings = await getGlobalMappings(supabase, jobId, ['comment']);
    // In merge mode, load global card mappings with targets to resolve cards from previous jobs
    const globalCardMap = mergeMode
      ? await getGlobalMappingsWithTargets(supabase, jobId, ['card'])
      : new Map<string, string>();

    const skipped = trelloComments.filter((c) => existingMappings.has(`comment:${c.id}`)).length;
    const skippedGlobal = trelloComments.filter((c) => globalCommentMappings.has(`comment:${c.id}`) && !existingMappings.has(`comment:${c.id}`)).length;
    if (skipped > 0) {
      await updateDetail(supabase, jobId, `${skipped}/${trelloComments.length} comments already imported — processing remaining`);
    }
    if (skippedGlobal > 0) {
      await updateDetail(supabase, jobId, `${skippedGlobal} comments from previous imports — skipping`);
    }

    // Collect new comments for batch insert
    type CommentItem = { trelloComment: TrelloComment; targetCardId: string; commentUserId: string };
    const commentsToInsert: CommentItem[] = [];

    for (const trelloComment of trelloComments) {
      if (!trelloComment.data.card) continue;
      if (existingMappings.has(`comment:${trelloComment.id}`) || globalCommentMappings.has(`comment:${trelloComment.id}`)) continue;

      const targetCardId = existingMappings.get(`card:${trelloComment.data.card.id}`)
        || globalCardMap.get(`card:${trelloComment.data.card.id}`)
        || null;
      if (!targetCardId) continue;

      const mapped = userMapping[trelloComment.idMemberCreator];
      const commentUserId = (mapped && mapped !== '__skip__') ? mapped : userId;
      commentsToInsert.push({ trelloComment, targetCardId, commentUserId });
    }

    await updateDetail(supabase, jobId, `${commentsToInsert.length} new comments to insert`);

    // Batch insert in groups of 100
    const COMMENT_BATCH_SIZE = 100;
    for (let batchStart = 0; batchStart < commentsToInsert.length; batchStart += COMMENT_BATCH_SIZE) {
      const batch = commentsToInsert.slice(batchStart, batchStart + COMMENT_BATCH_SIZE);
      const batchEnd = Math.min(batchStart + COMMENT_BATCH_SIZE, commentsToInsert.length);
      await updateDetail(supabase, jobId, `Inserting comments ${batchStart + 1}-${batchEnd}/${commentsToInsert.length}...`);

      try {
        const { data: insertedComments, error: batchErr } = await supabase
          .from('comments')
          .insert(batch.map(({ targetCardId, commentUserId, trelloComment }) => ({
            card_id: targetCardId,
            user_id: commentUserId,
            content: trelloComment.data.text,
          })))
          .select();

        if (batchErr || !insertedComments) {
          // Fallback to individual inserts
          report.errors.push(`Batch comment insert failed: ${batchErr?.message} — falling back`);
          for (const { trelloComment, targetCardId, commentUserId } of batch) {
            const { data: comment, error } = await supabase
              .from('comments')
              .insert({ card_id: targetCardId, user_id: commentUserId, content: trelloComment.data.text })
              .select().single();
            if (comment) {
              await recordMapping(supabase, jobId, 'comment', trelloComment.id, comment.id);
              report.comments_created++;
            } else {
              report.errors.push(`Failed to create comment: ${error?.message}`);
            }
          }
          await updateReport(supabase, jobId, report);
          continue;
        }

        // Batch record mappings
        await batchRecordMappings(supabase, jobId, insertedComments.map((comment, j) => ({
          sourceType: 'comment' as MigrationEntityType,
          sourceId: batch[j].trelloComment.id,
          targetId: comment.id,
        })));

        report.comments_created += insertedComments.length;
        await updateReport(supabase, jobId, report);
      } catch (batchCatchErr) {
        report.errors.push(`Error in comment batch: ${batchCatchErr instanceof Error ? batchCatchErr.message : String(batchCatchErr)}`);
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
  report: MigrationReport,
  listFilter?: string[]
) {
  try {
    const trelloCards = await cachedFetchTrelloCards(auth, trelloBoardId);
    let filteredCards = trelloCards.filter((c) => !c.closed);
    if (listFilter && listFilter.length > 0) {
      const allowedSet = new Set(listFilter);
      filteredCards = filteredCards.filter((c) => allowedSet.has(c.idList));
    }
    const cardsWithCovers = filteredCards.filter((c) => c.idAttachmentCover);

    if (cardsWithCovers.length === 0) {
      await updateDetail(supabase, jobId, 'No card covers to resolve');
      return;
    }

    await updateDetail(supabase, jobId, `Resolving ${cardsWithCovers.length} card covers...`);

    // Batch load all card and attachment mappings (replaces N+1 individual lookups)
    const mappings = await batchGetMappings(supabase, jobId, ['card', 'attachment']);
    // Also load global mappings for cards/attachments from previous jobs
    const globalCardMap = await getGlobalMappingsWithTargets(supabase, jobId, ['card']);
    const globalAttMap = await getGlobalMappingsWithTargets(supabase, jobId, ['attachment']);

    // Collect all cover pairs that need resolving
    const coverPairs: { targetCardId: string; targetAttId: string }[] = [];
    for (const trelloCard of cardsWithCovers) {
      const targetCardId = mappings.get(`card:${trelloCard.id}`) || globalCardMap.get(`card:${trelloCard.id}`);
      const targetAttId = mappings.get(`attachment:${trelloCard.idAttachmentCover!}`) || globalAttMap.get(`attachment:${trelloCard.idAttachmentCover!}`);
      if (targetCardId && targetAttId) {
        coverPairs.push({ targetCardId, targetAttId });
      }
    }

    if (coverPairs.length === 0) {
      await updateDetail(supabase, jobId, 'No card cover mappings found');
      return;
    }

    // Batch fetch all attachment records (pages of 200 for .in() limit)
    const attIds = Array.from(new Set(coverPairs.map((p) => p.targetAttId)));
    const attMap = new Map<string, { storage_path: string; mime_type: string }>();
    for (let i = 0; i < attIds.length; i += 200) {
      const chunk = attIds.slice(i, i + 200);
      const { data: attachments } = await supabase
        .from('attachments')
        .select('id, storage_path, mime_type')
        .in('id', chunk);
      for (const att of attachments || []) {
        if (att.storage_path && att.mime_type?.startsWith('image/')) {
          attMap.set(att.id, { storage_path: att.storage_path, mime_type: att.mime_type });
        }
      }
    }

    // Concurrent cover updates with semaphore(10)
    const coverSem = createSemaphore(10);
    let resolved = 0;
    await Promise.all(coverPairs.map(async ({ targetCardId, targetAttId }) => {
      const att = attMap.get(targetAttId);
      if (!att) return;
      await coverSem.acquire();
      try {
        await supabase
          .from('cards')
          .update({ cover_image_url: att.storage_path })
          .eq('id', targetCardId);
        resolved++;
        report.covers_resolved++;
      } finally {
        coverSem.release();
      }
    }));

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
  report: MigrationReport,
  mergeMode = false,
  listFilter?: string[]
): Promise<void> {
  try {
    const trelloCardsAll = await cachedFetchTrelloCards(auth, trelloBoardId);
    let openCards = trelloCardsAll.filter((c) => !c.closed);
    if (listFilter && listFilter.length > 0) {
      const allowedSet = new Set(listFilter);
      openCards = openCards.filter((c) => allowedSet.has(c.idList));
    }
    const cardsWithChecklists = openCards.filter(
      (c) => c.idChecklists.length > 0
    );
    await updateDetail(supabase, jobId, `${cardsWithChecklists.length} cards have checklists — checking already imported...`);

    // Batch-load existing card, checklist, and checklist_item mappings (avoids N+1)
    const existingMappings = await batchGetMappings(supabase, jobId, ['card', 'checklist', 'checklist_item']);
    // Always use WithTargets (returns Map) so we can resolve target IDs in merge mode
    const globalChecklistMappings = await getGlobalMappingsWithTargets(supabase, jobId, ['checklist', 'checklist_item']);
    // In merge mode, also load global card mappings to resolve cards from previous jobs
    const globalCardMap = mergeMode
      ? await getGlobalMappingsWithTargets(supabase, jobId, ['card'])
      : new Map<string, string>();

    // Concurrent checklist fetching with semaphore(6) + batch inserts
    const checklistSem = createSemaphore(6);
    let processedCards = 0;

    await Promise.all(cardsWithChecklists.map(async (trelloCard) => {
      const targetCardId = existingMappings.get(`card:${trelloCard.id}`)
        || globalCardMap.get(`card:${trelloCard.id}`)
        || null;
      if (!targetCardId) return;

      await checklistSem.acquire();
      try {
        processedCards++;
        if (processedCards % 5 === 0) {
          await updateDetail(supabase, jobId, `Checklists for card ${processedCards}/${cardsWithChecklists.length}: "${trelloCard.name}"`);
        }

        const trelloChecklists = await fetchTrelloChecklists(auth, trelloCard.id);

        // Separate merge-mode updates from fresh inserts
        const newChecklists: { trelloChecklist: TrelloChecklist; position: number }[] = [];

        for (let i = 0; i < trelloChecklists.length; i++) {
          const trelloChecklist = trelloChecklists[i];
          const existingChecklistId = existingMappings.get(`checklist:${trelloChecklist.id}`);
          const globalChecklistId = globalChecklistMappings.get(`checklist:${trelloChecklist.id}`);
          const alreadyImported = existingChecklistId || globalChecklistId;

          // Merge mode: update completion status on existing checklist items
          if (alreadyImported && mergeMode) {
            const resolvedChecklistId = existingChecklistId || (globalChecklistId as string);
            for (const item of trelloChecklist.checkItems) {
              const existingItemId = existingMappings.get(`checklist_item:${item.id}`)
                || globalChecklistMappings.get(`checklist_item:${item.id}`);
              if (existingItemId) {
                const { error: updateErr } = await supabase
                  .from('checklist_items')
                  .update({ is_completed: item.state === 'complete' })
                  .eq('id', existingItemId);
                if (!updateErr) report.checklist_items_updated++;
              } else {
                const { data: newItem, error: itemErr } = await supabase
                  .from('checklist_items')
                  .insert({
                    checklist_id: resolvedChecklistId,
                    content: item.name,
                    is_completed: item.state === 'complete',
                    position: trelloChecklist.checkItems.indexOf(item),
                  })
                  .select()
                  .single();
                if (newItem) {
                  await recordMapping(supabase, jobId, 'checklist_item', item.id, newItem.id);
                } else if (itemErr) {
                  report.errors.push(`Failed to create checklist item: ${itemErr.message}`);
                }
              }
            }
            continue;
          }

          if (alreadyImported) continue;
          newChecklists.push({ trelloChecklist, position: i });
        }

        // Batch insert new checklists for this card
        if (newChecklists.length > 0) {
          const { data: insertedChecklists, error: clErr } = await supabase
            .from('checklists')
            .insert(newChecklists.map(({ trelloChecklist, position }) => ({
              card_id: targetCardId,
              title: trelloChecklist.name,
              position,
            })))
            .select();

          if (clErr || !insertedChecklists) {
            report.errors.push(`Failed to batch insert checklists for "${trelloCard.name}": ${clErr?.message}`);
          } else {
            const clMappings: { sourceType: MigrationEntityType; sourceId: string; targetId: string }[] = [];
            const allItemInserts: { checklist_id: string; content: string; is_completed: boolean; position: number }[] = [];
            const allItemTrelloIds: string[] = [];

            for (let j = 0; j < insertedChecklists.length; j++) {
              const checklist = insertedChecklists[j];
              const { trelloChecklist } = newChecklists[j];

              clMappings.push({ sourceType: 'checklist', sourceId: trelloChecklist.id, targetId: checklist.id });
              report.checklists_created++;

              for (let k = 0; k < trelloChecklist.checkItems.length; k++) {
                const item = trelloChecklist.checkItems[k];
                if (existingMappings.has(`checklist_item:${item.id}`) || globalChecklistMappings.has(`checklist_item:${item.id}`)) continue;
                allItemInserts.push({
                  checklist_id: checklist.id,
                  content: item.name,
                  is_completed: item.state === 'complete',
                  position: k,
                });
                allItemTrelloIds.push(item.id);
              }
            }

            // Batch insert all checklist items for this card's checklists
            if (allItemInserts.length > 0) {
              const { data: insertedItems, error: itemErr } = await supabase
                .from('checklist_items')
                .insert(allItemInserts)
                .select();

              if (insertedItems) {
                const itemMappings = insertedItems.map((item, k) => ({
                  sourceType: 'checklist_item' as MigrationEntityType,
                  sourceId: allItemTrelloIds[k],
                  targetId: item.id,
                }));
                await batchRecordMappings(supabase, jobId, [...clMappings, ...itemMappings]);
              } else {
                if (itemErr) report.errors.push(`Failed to batch insert checklist items: ${itemErr.message}`);
                await batchRecordMappings(supabase, jobId, clMappings);
              }
            } else {
              await batchRecordMappings(supabase, jobId, clMappings);
            }
          }
        }

        if ((report.checklists_created + report.checklist_items_updated) % 25 === 0 && (report.checklists_created + report.checklist_items_updated) > 0) {
          await updateReport(supabase, jobId, report);
        }
      } finally {
        checklistSem.release();
      }
    }));
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
  report: MigrationReport,
  mergeMode = false,
  deadline = 0,
  listFilter?: string[]
): Promise<void> {
  try {
    // Batch-load existing card + attachment mappings (avoids N+1)
    const existingMappings = await batchGetMappings(supabase, jobId, ['card', 'attachment']);
    const globalAttachmentMappings = await getGlobalMappings(supabase, jobId, ['attachment']);
    // In merge mode, load global card mappings to resolve cards from previous jobs
    const globalCardMap = mergeMode
      ? await getGlobalMappingsWithTargets(supabase, jobId, ['card'])
      : new Map<string, string>();

    // In merge mode, invalidate cached manifest so Trello is re-scanned for new attachments
    if (mergeMode) {
      await supabase
        .from('migration_entity_map')
        .delete()
        .eq('job_id', jobId)
        .eq('source_type', 'attachment_manifest')
        .eq('source_id', trelloBoardId);
    }

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
      // Slow path: first run or merge mode — scan Trello and cache the results
      const trelloCards = await cachedFetchTrelloCards(auth, trelloBoardId);
      let openCards = trelloCards.filter((c) => !c.closed);
      if (listFilter && listFilter.length > 0) {
        const allowedSet = new Set(listFilter);
        openCards = openCards.filter((c) => allowedSet.has(c.idList));
      }
      await updateDetail(supabase, jobId, `Scanning ${openCards.length} cards for attachments...`);

      // Concurrent attachment scanning with semaphore(8)
      const scanSem = createSemaphore(8);
      let scanned = 0;
      await Promise.all(openCards.map(async (trelloCard) => {
        // Resolve target card: current job or global (merge mode)
        const targetCardId = existingMappings.get(`card:${trelloCard.id}`)
          || globalCardMap.get(`card:${trelloCard.id}`)
          || null;
        if (!targetCardId) return;

        await scanSem.acquire();
        try {
          let trelloAttachments: TrelloAttachment[];
          try {
            trelloAttachments = await fetchTrelloAttachments(auth, trelloCard.id);
          } catch {
            report.errors.push(`Failed to fetch attachments for card "${trelloCard.name}"`);
            return;
          }

          for (const att of trelloAttachments) {
            if (!att.url || att.bytes === 0) continue;
            allAttachments.push({ card: trelloCard, targetCardId, att });
          }

          scanned++;
          if (scanned % 50 === 0) {
            await updateDetail(supabase, jobId, `Scanning card ${scanned}/${openCards.length} for attachments — ${allAttachments.length} found so far`);
          }
        } finally {
          scanSem.release();
        }
      }));

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

    // Pass 2: Concurrent download+upload with semaphore(5)
    const downloadSem = createSemaphore(5);
    let downloadedCount = 0;
    let deadlineBailed = false;

    await Promise.all(pendingAttachments.map(async ({ card: trelloCard, targetCardId, att }) => {
      // Check deadline before starting new downloads
      if (deadline > 0 && Date.now() > deadline - 30_000) {
        deadlineBailed = true;
        return;
      }

      // Skip files over our absolute max unless S3 is configured
      if (att.bytes > MAX_ATTACHMENT_BYTES && !isS3Configured()) {
        report.errors.push(
          `Skipped attachment "${att.name}" on card "${trelloCard.name}" — ${Math.round(att.bytes / 1024 / 1024)}MB exceeds ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB limit (configure AWS S3 for large files)`
        );
        return;
      }

      await downloadSem.acquire();
      try {
        // Only download Trello-hosted files; skip external links (Google Drive, websites, etc.)
        const isTrelloHosted = att.url.includes('trello.com') || att.url.includes('trello-attachments');
        if (!isTrelloHosted) {
          // Record link-type attachments as metadata-only (no file download)
          const { data: linkAtt } = await supabase
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
          downloadedCount++;
          return;
        }

        // Download file via Trello's API download endpoint (not the raw S3 URL).
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
          return;
        }
        if (!fileRes.ok) {
          report.errors.push(`Failed to download "${att.name}" from Trello (HTTP ${fileRes.status})`);
          return;
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
          const s3Key = buildS3Key(targetCardId, safeName);
          try {
            await uploadToS3(s3Key, Buffer.from(fileBuffer), att.mimeType || 'application/octet-stream');
            finalStoragePath = `s3://${s3Key}`;
          } catch (s3Err: any) {
            report.errors.push(`Failed to upload "${att.name}" to S3: ${s3Err.message}`);
            return;
          }
        } else if (actualSize <= SUPABASE_SIZE_LIMIT) {
          const { error: uploadError } = await supabase.storage
            .from('card-attachments')
            .upload(storagePath, fileBuffer, {
              contentType: att.mimeType || 'application/octet-stream',
              upsert: false,
            });

          if (uploadError) {
            report.errors.push(`Failed to upload "${att.name}": ${uploadError.message}`);
            return;
          }
          finalStoragePath = storagePath;
        } else {
          report.errors.push(
            `Skipped "${att.name}" (${Math.round(actualSize / 1024 / 1024)}MB) — too large for Supabase, S3 not configured`
          );
          return;
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
          return;
        }

        await recordMapping(supabase, jobId, 'attachment', att.id, attachment.id, {
          original_name: att.name,
          file_size: actualSize || att.bytes || 0,
        });
        report.attachments_created++;

        downloadedCount++;
        if (downloadedCount % 25 === 0) {
          await updateDetail(supabase, jobId, `Downloaded ${downloadedCount}/${pendingAttachments.length} attachments...`);
          await updateReport(supabase, jobId, report);
        }
      } catch (err) {
        report.errors.push(
          `Error processing attachment "${att.name}" on card "${trelloCard.name}": ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        downloadSem.release();
      }
    }));
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
  clearTrelloCache();
  _lastDetailWrite = 0;

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
    cards_updated: prev?.cards_updated ?? 0,
    comments_created: prev?.comments_created ?? 0,
    attachments_created: prev?.attachments_created ?? 0,
    labels_created: prev?.labels_created ?? 0,
    checklists_created: prev?.checklists_created ?? 0,
    checklist_items_updated: prev?.checklist_items_updated ?? 0,
    placements_removed: prev?.placements_removed ?? 0,
    covers_resolved: prev?.covers_resolved ?? 0,
    positions_synced: prev?.positions_synced ?? 0,
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
