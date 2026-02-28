import { SupabaseClient } from '@supabase/supabase-js';
import type { CursorPaginationParams, CursorPaginationResult } from './types';

// ============================================================================
// CURSOR-BASED PAGINATION
// ============================================================================

/**
 * Build a cursor-paginated query for cards.
 */
export async function paginateCards(
  supabase: SupabaseClient,
  boardId: string,
  listId?: string,
  params: CursorPaginationParams = { limit: 50, direction: 'forward' }
): Promise<CursorPaginationResult<Record<string, unknown>>> {
  const limit = Math.min(params.limit, 200);

  let query = supabase
    .from('card_placements')
    .select(`
      id,
      position,
      card_id,
      list_id,
      board_id,
      cards (
        id, title, description, priority, due_date, created_at, updated_at
      )
    `)
    .eq('board_id', boardId);

  if (listId) query = query.eq('list_id', listId);

  if (params.cursor) {
    if (params.direction === 'forward') {
      query = query.gt('cards.created_at', params.cursor);
    } else {
      query = query.lt('cards.created_at', params.cursor);
    }
  }

  query = query
    .order('position', { ascending: true })
    .limit(limit + 1); // Fetch one extra to determine has_more

  const { data } = await query;
  const rows = (data as Record<string, unknown>[]) ?? [];

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const lastItem = items.length > 0 ? items[items.length - 1] : null;
  const nextCursor = hasMore && lastItem
    ? ((lastItem as Record<string, unknown>).cards as Record<string, unknown>)?.created_at as string
    : null;

  return {
    items,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

/**
 * Paginate any table with cursor-based approach.
 */
export async function paginateTable(
  supabase: SupabaseClient,
  tableName: string,
  params: {
    cursor?: string;
    cursorColumn?: string;
    limit?: number;
    direction?: 'forward' | 'backward';
    filters?: Record<string, unknown>;
    orderBy?: string;
    ascending?: boolean;
  }
): Promise<CursorPaginationResult<Record<string, unknown>>> {
  const limit = Math.min(params.limit ?? 50, 200);
  const cursorCol = params.cursorColumn ?? 'created_at';
  const ascending = params.ascending ?? false;

  let query = supabase
    .from(tableName)
    .select('*');

  // Apply filters
  if (params.filters) {
    const filterEntries = Object.entries(params.filters);
    for (const [key, value] of filterEntries) {
      query = query.eq(key, value);
    }
  }

  // Apply cursor
  if (params.cursor) {
    if (params.direction === 'backward') {
      query = ascending ? query.lt(cursorCol, params.cursor) : query.gt(cursorCol, params.cursor);
    } else {
      query = ascending ? query.gt(cursorCol, params.cursor) : query.lt(cursorCol, params.cursor);
    }
  }

  query = query
    .order(params.orderBy ?? cursorCol, { ascending })
    .limit(limit + 1);

  const { data } = await query;
  const rows = (data as Record<string, unknown>[]) ?? [];

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const lastItem = items.length > 0 ? items[items.length - 1] : null;
  const nextCursor = hasMore && lastItem ? (lastItem[cursorCol] as string) : null;

  return {
    items,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

// ============================================================================
// BATCH LOADING (N+1 fix helpers)
// ============================================================================

/**
 * Load cards with all related data in minimal queries (fixes N+1).
 */
export async function loadBoardWithAllData(
  supabase: SupabaseClient,
  boardId: string
): Promise<{
  board: Record<string, unknown> | null;
  lists: Record<string, unknown>[];
  placements: Record<string, unknown>[];
  labels: Record<string, unknown>[];
  cardLabels: Record<string, unknown>[];
  assignees: Record<string, unknown>[];
}> {
  // Single query per table instead of per-card
  const [boardRes, listsRes, placementsRes, labelsRes, cardLabelsRes, assigneesRes] = await Promise.all([
    supabase.from('boards').select('*').eq('id', boardId).single(),
    supabase.from('lists').select('*').eq('board_id', boardId).order('position', { ascending: true }),
    supabase
      .from('card_placements')
      .select('*, cards(*)')
      .eq('board_id', boardId)
      .order('position', { ascending: true })
      .limit(50000),
    supabase.from('labels').select('*').eq('board_id', boardId),
    supabase
      .from('card_labels')
      .select('*')
      .in(
        'card_id',
        // Will be empty initially; needs card IDs from placements
        []
      ),
    supabase
      .from('card_assignees')
      .select('*, profiles(*)')
      .in('card_id', []),
  ]);

  const placements = (placementsRes.data as Record<string, unknown>[]) ?? [];
  const cardIds = placements.map((p) => (p.cards as Record<string, unknown>)?.id as string).filter(Boolean);

  // Fetch card-related data with collected IDs
  let cardLabels: Record<string, unknown>[] = [];
  let assignees: Record<string, unknown>[] = [];

  if (cardIds.length > 0) {
    const [clRes, aRes] = await Promise.all([
      supabase.from('card_labels').select('*').in('card_id', cardIds).limit(50000),
      supabase.from('card_assignees').select('*, profiles(*)').in('card_id', cardIds).limit(50000),
    ]);
    cardLabels = (clRes.data as Record<string, unknown>[]) ?? [];
    assignees = (aRes.data as Record<string, unknown>[]) ?? [];
  }

  return {
    board: boardRes.data as Record<string, unknown> | null,
    lists: (listsRes.data as Record<string, unknown>[]) ?? [],
    placements,
    labels: (labelsRes.data as Record<string, unknown>[]) ?? [],
    cardLabels,
    assignees,
  };
}

// ============================================================================
// PERFORMANCE BASELINE
// ============================================================================

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  threshold: number; // Max acceptable value
}

export const PERFORMANCE_THRESHOLDS: PerformanceMetric[] = [
  { name: 'page_load_ms', value: 0, unit: 'ms', threshold: 2000 },
  { name: 'board_load_ms', value: 0, unit: 'ms', threshold: 3000 },
  { name: 'card_drag_fps', value: 0, unit: 'fps', threshold: 30 },
  { name: 'realtime_latency_ms', value: 0, unit: 'ms', threshold: 500 },
  { name: 'api_p95_ms', value: 0, unit: 'ms', threshold: 1000 },
];

export function checkPerformanceRegression(
  baseline: PerformanceMetric[],
  current: PerformanceMetric[],
  maxDegradationPct: number = 10
): { passed: boolean; regressions: string[] } {
  const regressions: string[] = [];

  for (const currentMetric of current) {
    const baselineMetric = baseline.find((b) => b.name === currentMetric.name);
    if (!baselineMetric || baselineMetric.value === 0) continue;

    // For FPS metrics, lower is worse; for latency, higher is worse
    const isFpsMetric = currentMetric.unit === 'fps';
    const degraded = isFpsMetric
      ? currentMetric.value < baselineMetric.value * (1 - maxDegradationPct / 100)
      : currentMetric.value > baselineMetric.value * (1 + maxDegradationPct / 100);

    if (degraded) {
      regressions.push(
        `${currentMetric.name}: ${baselineMetric.value}${currentMetric.unit} → ${currentMetric.value}${currentMetric.unit} (>${maxDegradationPct}% degradation)`
      );
    }
  }

  return { passed: regressions.length === 0, regressions };
}
