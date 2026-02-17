import { SupabaseClient } from '@supabase/supabase-js';
import type {
  RevisionMetrics,
  RevisionReportExport,
  RevisionAnalysis,
  CardColumnHistory,
} from './types';

// ============================================================================
// PING-PONG DETECTION
// ============================================================================

const REVISION_COLUMNS = ['Revisions', 'Revision', 'Changes Requested', 'Client Revisions'];
const WORK_COLUMNS = ['In Progress', 'Working', 'In Development', 'Designing'];

export function detectPingPong(
  history: CardColumnHistory[],
  revisionColumns: string[] = REVISION_COLUMNS,
  workColumns: string[] = WORK_COLUMNS
): number {
  let pingPongCount = 0;
  let lastWasRevision = false;
  let lastWasWork = false;

  for (const entry of history) {
    const toName = entry.to_list_name ?? '';
    const isRevision = revisionColumns.some((r) => toName.toLowerCase().includes(r.toLowerCase()));
    const isWork = workColumns.some((w) => toName.toLowerCase().includes(w.toLowerCase()));

    if (isRevision && lastWasWork) {
      pingPongCount++;
    }
    if (isWork && lastWasRevision) {
      // Count the back transition as well
    }

    lastWasRevision = isRevision;
    lastWasWork = isWork;
  }

  return pingPongCount;
}

export function calculateRevisionTime(
  history: CardColumnHistory[],
  revisionColumns: string[] = REVISION_COLUMNS
): number {
  let totalMinutes = 0;
  let enteredRevision: Date | null = null;

  for (const entry of history) {
    const toName = entry.to_list_name ?? '';
    const isRevision = revisionColumns.some((r) => toName.toLowerCase().includes(r.toLowerCase()));

    if (isRevision && !enteredRevision) {
      enteredRevision = new Date(entry.moved_at);
    } else if (!isRevision && enteredRevision) {
      const exitedAt = new Date(entry.moved_at);
      totalMinutes += Math.round((exitedAt.getTime() - enteredRevision.getTime()) / 60000);
      enteredRevision = null;
    }
  }

  return totalMinutes;
}

// ============================================================================
// OUTLIER DETECTION
// ============================================================================

export const OUTLIER_MULTIPLIER = 1.5;

export function detectOutliers(
  cardMetrics: { cardId: string; pingPongCount: number }[]
): { cardId: string; isOutlier: boolean; reason?: string }[] {
  if (cardMetrics.length === 0) return [];

  const counts = cardMetrics.map((m) => m.pingPongCount);
  const avg = counts.reduce((sum, c) => sum + c, 0) / counts.length;
  const threshold = avg * OUTLIER_MULTIPLIER;

  return cardMetrics.map((m) => ({
    cardId: m.cardId,
    isOutlier: m.pingPongCount > threshold,
    reason: m.pingPongCount > threshold
      ? `Ping-pong count (${m.pingPongCount}) exceeds threshold (${threshold.toFixed(1)})`
      : undefined,
  }));
}

// ============================================================================
// COMPUTE REVISION METRICS FOR A BOARD
// ============================================================================

export async function computeBoardRevisionMetrics(
  supabase: SupabaseClient,
  boardId: string,
  startDate?: string,
  endDate?: string
): Promise<RevisionAnalysis> {
  // Get all column history for the board
  let query = supabase
    .from('card_column_history')
    .select('*')
    .eq('board_id', boardId)
    .order('moved_at', { ascending: true });

  if (startDate) query = query.gte('moved_at', startDate);
  if (endDate) query = query.lte('moved_at', endDate);

  const { data } = await query;
  const allHistory = (data as CardColumnHistory[]) ?? [];

  // Group by card
  const byCard = new Map<string, CardColumnHistory[]>();
  for (const entry of allHistory) {
    const existing = byCard.get(entry.card_id) ?? [];
    existing.push(entry);
    byCard.set(entry.card_id, existing);
  }

  // Compute per-card metrics
  const cardMetrics: RevisionMetrics[] = [];
  const pingPongCounts: { cardId: string; pingPongCount: number }[] = [];

  const cardEntries = Array.from(byCard.entries());
  for (const [cardId, history] of cardEntries) {
    const pingPong = detectPingPong(history);
    const revTime = calculateRevisionTime(history);
    const revisionEntries = history.filter((h: CardColumnHistory) =>
      REVISION_COLUMNS.some((r) => (h.to_list_name ?? '').toLowerCase().includes(r.toLowerCase()))
    );

    pingPongCounts.push({ cardId, pingPongCount: pingPong });

    cardMetrics.push({
      id: '', // Will be set on DB insert
      card_id: cardId,
      board_id: boardId,
      ping_pong_count: pingPong,
      total_revision_time_minutes: revTime,
      first_revision_at: revisionEntries.length > 0 ? revisionEntries[0].moved_at : null,
      last_revision_at: revisionEntries.length > 0 ? revisionEntries[revisionEntries.length - 1].moved_at : null,
      is_outlier: false,
      outlier_reason: null,
      avg_board_ping_pong: null,
      computed_at: new Date().toISOString(),
    });
  }

  // Detect outliers
  const outliers = detectOutliers(pingPongCounts);
  const avgPingPong = pingPongCounts.length > 0
    ? pingPongCounts.reduce((sum, p) => sum + p.pingPongCount, 0) / pingPongCounts.length
    : 0;

  for (const metric of cardMetrics) {
    const outlier = outliers.find((o) => o.cardId === metric.card_id);
    if (outlier) {
      metric.is_outlier = outlier.isOutlier;
      metric.outlier_reason = outlier.reason ?? null;
    }
    metric.avg_board_ping_pong = Math.round(avgPingPong * 100) / 100;
  }

  return {
    boardId,
    avgPingPongCount: Math.round(avgPingPong * 100) / 100,
    outlierThreshold: Math.round(avgPingPong * OUTLIER_MULTIPLIER * 100) / 100,
    totalCards: cardMetrics.length,
    outlierCount: cardMetrics.filter((m) => m.is_outlier).length,
    cards: cardMetrics,
  };
}

// ============================================================================
// STORE/RETRIEVE REVISION METRICS
// ============================================================================

export async function storeRevisionMetrics(
  supabase: SupabaseClient,
  metrics: RevisionMetrics[]
): Promise<void> {
  if (metrics.length === 0) return;

  const rows = metrics.map((m) => ({
    card_id: m.card_id,
    board_id: m.board_id,
    ping_pong_count: m.ping_pong_count,
    total_revision_time_minutes: m.total_revision_time_minutes,
    first_revision_at: m.first_revision_at,
    last_revision_at: m.last_revision_at,
    is_outlier: m.is_outlier,
    outlier_reason: m.outlier_reason,
    avg_board_ping_pong: m.avg_board_ping_pong,
  }));

  await supabase.from('revision_metrics').insert(rows);
}

export async function getRevisionMetrics(
  supabase: SupabaseClient,
  boardId: string,
  outliersOnly?: boolean
): Promise<RevisionMetrics[]> {
  let query = supabase
    .from('revision_metrics')
    .select('*')
    .eq('board_id', boardId)
    .order('ping_pong_count', { ascending: false });

  if (outliersOnly) query = query.eq('is_outlier', true);

  const { data } = await query;
  return (data as RevisionMetrics[]) ?? [];
}

export async function getCardRevisionMetrics(
  supabase: SupabaseClient,
  cardId: string
): Promise<RevisionMetrics | null> {
  const { data } = await supabase
    .from('revision_metrics')
    .select('*')
    .eq('card_id', cardId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single();

  return data as RevisionMetrics | null;
}

// ============================================================================
// REPORT EXPORTS
// ============================================================================

export async function createRevisionExport(
  supabase: SupabaseClient,
  params: {
    boardId?: string;
    department?: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    format: string;
    generatedBy: string;
  }
): Promise<RevisionReportExport | null> {
  const { data, error } = await supabase
    .from('revision_report_exports')
    .insert({
      board_id: params.boardId ?? null,
      department: params.department ?? null,
      date_range_start: params.dateRangeStart,
      date_range_end: params.dateRangeEnd,
      format: params.format,
      generated_by: params.generatedBy,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return null;
  return data as RevisionReportExport;
}

export async function getRevisionExports(
  supabase: SupabaseClient,
  boardId?: string
): Promise<RevisionReportExport[]> {
  let query = supabase
    .from('revision_report_exports')
    .select('*')
    .order('created_at', { ascending: false });

  if (boardId) query = query.eq('board_id', boardId);

  const { data } = await query;
  return (data as RevisionReportExport[]) ?? [];
}

export async function updateRevisionExport(
  supabase: SupabaseClient,
  exportId: string,
  updates: Partial<Pick<RevisionReportExport, 'status' | 'storage_path' | 'file_size_bytes' | 'error_message'>>
): Promise<void> {
  await supabase
    .from('revision_report_exports')
    .update(updates)
    .eq('id', exportId);
}

// ============================================================================
// CSV EXPORT HELPER
// ============================================================================

export function formatRevisionMetricsCSV(metrics: RevisionMetrics[]): string {
  const header = 'Card ID,Board ID,Ping-Pong Count,Revision Time (min),Is Outlier,First Revision,Last Revision';
  const rows = metrics.map((m) => {
    return [
      m.card_id,
      m.board_id,
      m.ping_pong_count,
      m.total_revision_time_minutes,
      m.is_outlier,
      m.first_revision_at ?? '',
      m.last_revision_at ?? '',
    ].join(',');
  });
  return [header, ...rows].join('\n');
}
