import { SupabaseClient } from '@supabase/supabase-js';
import type {
  CardColumnHistory,
  ProductivitySnapshot,
  ScheduledReport,
  ProductivityMetrics,
  UserScorecard,
} from './types';

// ============================================================================
// CARD COLUMN HISTORY
// ============================================================================

export async function logColumnMove(
  supabase: SupabaseClient,
  params: {
    cardId: string;
    boardId: string;
    fromListId?: string;
    toListId: string;
    fromListName?: string;
    toListName?: string;
    movedBy?: string;
  }
): Promise<void> {
  await supabase.from('card_column_history').insert({
    card_id: params.cardId,
    board_id: params.boardId,
    from_list_id: params.fromListId ?? null,
    to_list_id: params.toListId,
    from_list_name: params.fromListName ?? null,
    to_list_name: params.toListName ?? null,
    moved_by: params.movedBy ?? null,
  });
}

export async function getCardColumnHistory(
  supabase: SupabaseClient,
  cardId: string
): Promise<CardColumnHistory[]> {
  const { data } = await supabase
    .from('card_column_history')
    .select('*')
    .eq('card_id', cardId)
    .order('moved_at', { ascending: true });

  return (data as CardColumnHistory[]) ?? [];
}

export async function getBoardColumnHistory(
  supabase: SupabaseClient,
  boardId: string,
  startDate?: string,
  endDate?: string
): Promise<CardColumnHistory[]> {
  let query = supabase
    .from('card_column_history')
    .select('*')
    .eq('board_id', boardId)
    .order('moved_at', { ascending: true });

  if (startDate) query = query.gte('moved_at', startDate);
  if (endDate) query = query.lte('moved_at', endDate);

  const { data } = await query;
  return (data as CardColumnHistory[]) ?? [];
}

// ============================================================================
// CYCLE TIME CALCULATION
// ============================================================================

export function calculateCycleTime(history: CardColumnHistory[]): number | null {
  if (history.length < 2) return null;

  const firstMove = new Date(history[0].moved_at);
  const lastMove = new Date(history[history.length - 1].moved_at);
  const diffMs = lastMove.getTime() - firstMove.getTime();

  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100; // hours with 2 decimals
}

export function calculateOnTimeRate(
  cards: { due_date: string | null; completed_at: string | null }[]
): number {
  const withDueDate = cards.filter((c) => c.due_date !== null);
  if (withDueDate.length === 0) return 100;

  const onTime = withDueDate.filter((c) => {
    if (!c.completed_at) return false;
    return new Date(c.completed_at) <= new Date(c.due_date!);
  });

  return Math.round((onTime.length / withDueDate.length) * 10000) / 100;
}

export function calculateRevisionRate(
  histories: CardColumnHistory[][],
  revisionColumnNames: string[] = ['Revisions', 'Revision', 'Changes Requested']
): number {
  if (histories.length === 0) return 0;

  const withRevisions = histories.filter((history) =>
    history.some((h) => revisionColumnNames.includes(h.to_list_name ?? ''))
  );

  return Math.round((withRevisions.length / histories.length) * 10000) / 100;
}

// ============================================================================
// PRODUCTIVITY SNAPSHOTS
// ============================================================================

export async function getProductivitySnapshots(
  supabase: SupabaseClient,
  filters: {
    startDate: string;
    endDate: string;
    userId?: string;
    boardId?: string;
    department?: string;
  }
): Promise<ProductivitySnapshot[]> {
  let query = supabase
    .from('productivity_snapshots')
    .select('*')
    .gte('snapshot_date', filters.startDate)
    .lte('snapshot_date', filters.endDate)
    .order('snapshot_date', { ascending: true });

  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.boardId) query = query.eq('board_id', filters.boardId);
  if (filters.department) query = query.eq('department', filters.department);

  const { data } = await query;
  return (data as ProductivitySnapshot[]) ?? [];
}

export async function createProductivitySnapshot(
  supabase: SupabaseClient,
  snapshot: {
    snapshotDate: string;
    userId?: string;
    boardId?: string;
    department?: string;
    ticketsCompleted: number;
    ticketsCreated: number;
    avgCycleTimeHours?: number;
    onTimeRate?: number;
    revisionRate?: number;
    aiPassRate?: number;
    totalTimeLoggedMinutes?: number;
  }
): Promise<ProductivitySnapshot | null> {
  const { data, error } = await supabase
    .from('productivity_snapshots')
    .upsert({
      snapshot_date: snapshot.snapshotDate,
      user_id: snapshot.userId ?? null,
      board_id: snapshot.boardId ?? null,
      department: snapshot.department ?? null,
      tickets_completed: snapshot.ticketsCompleted,
      tickets_created: snapshot.ticketsCreated,
      avg_cycle_time_hours: snapshot.avgCycleTimeHours ?? null,
      on_time_rate: snapshot.onTimeRate ?? null,
      revision_rate: snapshot.revisionRate ?? null,
      ai_pass_rate: snapshot.aiPassRate ?? null,
      total_time_logged_minutes: snapshot.totalTimeLoggedMinutes ?? 0,
    })
    .select()
    .single();

  if (error) return null;
  return data as ProductivitySnapshot;
}

// ============================================================================
// AGGREGATE METRICS
// ============================================================================

export function aggregateSnapshots(snapshots: ProductivitySnapshot[]): ProductivityMetrics {
  if (snapshots.length === 0) {
    return {
      ticketsCompleted: 0,
      ticketsCreated: 0,
      avgCycleTimeHours: 0,
      onTimeRate: 0,
      revisionRate: 0,
      aiPassRate: 0,
    };
  }

  const ticketsCompleted = snapshots.reduce((sum, s) => sum + s.tickets_completed, 0);
  const ticketsCreated = snapshots.reduce((sum, s) => sum + s.tickets_created, 0);

  const cycleTimeSamples = snapshots.filter((s) => s.avg_cycle_time_hours !== null);
  const avgCycleTimeHours = cycleTimeSamples.length > 0
    ? Math.round((cycleTimeSamples.reduce((sum, s) => sum + (s.avg_cycle_time_hours ?? 0), 0) / cycleTimeSamples.length) * 100) / 100
    : 0;

  const onTimeRateSamples = snapshots.filter((s) => s.on_time_rate !== null);
  const onTimeRate = onTimeRateSamples.length > 0
    ? Math.round((onTimeRateSamples.reduce((sum, s) => sum + (s.on_time_rate ?? 0), 0) / onTimeRateSamples.length) * 100) / 100
    : 0;

  const revRateSamples = snapshots.filter((s) => s.revision_rate !== null);
  const revisionRate = revRateSamples.length > 0
    ? Math.round((revRateSamples.reduce((sum, s) => sum + (s.revision_rate ?? 0), 0) / revRateSamples.length) * 100) / 100
    : 0;

  const aiPassSamples = snapshots.filter((s) => s.ai_pass_rate !== null);
  const aiPassRate = aiPassSamples.length > 0
    ? Math.round((aiPassSamples.reduce((sum, s) => sum + (s.ai_pass_rate ?? 0), 0) / aiPassSamples.length) * 100) / 100
    : 0;

  return { ticketsCompleted, ticketsCreated, avgCycleTimeHours, onTimeRate, revisionRate, aiPassRate };
}

export function buildUserScorecards(
  userSnapshots: Map<string, ProductivitySnapshot[]>,
  userNames: Map<string, string>
): UserScorecard[] {
  const scorecards: UserScorecard[] = [];

  const entries = Array.from(userSnapshots.entries());
  for (const [userId, snapshots] of entries) {
    const metrics = aggregateSnapshots(snapshots);
    const trend = snapshots.map((s: ProductivitySnapshot) => ({
      date: s.snapshot_date,
      completed: s.tickets_completed,
    }));

    scorecards.push({
      userId,
      userName: userNames.get(userId) ?? 'Unknown',
      metrics,
      trend,
      rank: 0,
    });
  }

  // Rank by tickets completed
  scorecards.sort((a, b) => b.metrics.ticketsCompleted - a.metrics.ticketsCompleted);
  scorecards.forEach((s, i) => { s.rank = i + 1; });

  return scorecards;
}

// ============================================================================
// SCHEDULED REPORTS
// ============================================================================

export async function getScheduledReports(
  supabase: SupabaseClient,
  filters?: { reportType?: string; isActive?: boolean }
): Promise<ScheduledReport[]> {
  let query = supabase
    .from('scheduled_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.reportType) query = query.eq('report_type', filters.reportType);
  if (filters?.isActive !== undefined) query = query.eq('is_active', filters.isActive);

  const { data } = await query;
  return (data as ScheduledReport[]) ?? [];
}

export async function createScheduledReport(
  supabase: SupabaseClient,
  report: {
    name: string;
    reportType: string;
    schedule: string;
    recipients: string[];
    config?: Record<string, unknown>;
    createdBy: string;
  }
): Promise<ScheduledReport | null> {
  const nextSendAt = calculateNextSendAt(report.schedule);

  const { data, error } = await supabase
    .from('scheduled_reports')
    .insert({
      name: report.name,
      report_type: report.reportType,
      schedule: report.schedule,
      recipients: report.recipients,
      config: report.config ?? {},
      is_active: true,
      next_send_at: nextSendAt,
      created_by: report.createdBy,
    })
    .select()
    .single();

  if (error) return null;
  return data as ScheduledReport;
}

export async function updateScheduledReport(
  supabase: SupabaseClient,
  reportId: string,
  updates: Partial<Pick<ScheduledReport, 'name' | 'schedule' | 'recipients' | 'config' | 'is_active'>>
): Promise<ScheduledReport | null> {
  const dbUpdates: Record<string, unknown> = { ...updates };

  if (updates.schedule) {
    dbUpdates.next_send_at = calculateNextSendAt(updates.schedule);
  }

  const { data, error } = await supabase
    .from('scheduled_reports')
    .update(dbUpdates)
    .eq('id', reportId)
    .select()
    .single();

  if (error) return null;
  return data as ScheduledReport;
}

export async function deleteScheduledReport(
  supabase: SupabaseClient,
  reportId: string
): Promise<void> {
  await supabase.from('scheduled_reports').delete().eq('id', reportId);
}

export function calculateNextSendAt(schedule: string): string {
  const now = new Date();
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);

  if (schedule === 'daily') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (schedule.startsWith('weekly:')) {
    const dayName = schedule.split(':')[1];
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.indexOf(dayName.toLowerCase());
    if (targetDay >= 0) {
      const currentDay = next.getDay();
      const diff = (targetDay - currentDay + 7) % 7 || 7;
      next.setDate(next.getDate() + diff);
    }
  } else if (schedule.startsWith('monthly:')) {
    const day = parseInt(schedule.split(':')[1], 10);
    next.setDate(day);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}
