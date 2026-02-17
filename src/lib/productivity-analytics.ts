import { SupabaseClient } from '@supabase/supabase-js';
import type {
  CardColumnHistory,
  ProductivitySnapshot,
  ScheduledReport,
  ProductivityMetrics,
  UserScorecard,
  ProductivityAlert,
  DepartmentRollup,
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

// ============================================================================
// ANOMALY DETECTION & ALERTS (P9.1)
// ============================================================================

export interface AlertThresholds {
  revisionRate?: { warning: number; critical?: number }; // multiplier of team avg (default 1.5x)
  cycleTime?: { warning: number; critical?: number };     // multiplier of team avg (default 2x)
  onTimeRate?: { warning: number; critical?: number };    // absolute % floor (default 60%)
  aiPassRate?: { warning: number; critical?: number };    // absolute % floor (default 50%)
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  revisionRate: { warning: 1.5 },
  cycleTime: { warning: 2 },
  onTimeRate: { warning: 60, critical: 40 },
  aiPassRate: { warning: 50 },
};

export function generateAlerts(
  snapshots: ProductivitySnapshot[],
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): Omit<ProductivityAlert, 'id' | 'created_at'>[] {
  if (snapshots.length === 0) return [];

  const alerts: Omit<ProductivityAlert, 'id' | 'created_at'>[] = [];
  const teamMetrics = aggregateSnapshots(snapshots);

  // Group snapshots by user
  const byUser = new Map<string, ProductivitySnapshot[]>();
  for (const s of snapshots) {
    if (!s.user_id) continue;
    const existing = byUser.get(s.user_id) ?? [];
    existing.push(s);
    byUser.set(s.user_id, existing);
  }

  const userEntries = Array.from(byUser.entries());
  for (const [userId, userSnapshots] of userEntries) {
    const userMetrics = aggregateSnapshots(userSnapshots);
    const boardId = userSnapshots[0]?.board_id ?? null;

    // Revision rate: flag if user revision rate > team avg * multiplier
    if (thresholds.revisionRate && teamMetrics.revisionRate > 0) {
      const warningThreshold = teamMetrics.revisionRate * thresholds.revisionRate.warning;
      if (userMetrics.revisionRate > warningThreshold) {
        alerts.push({
          board_id: boardId,
          user_id: userId,
          metric_name: 'revision_rate',
          current_value: userMetrics.revisionRate,
          threshold_value: warningThreshold,
          alert_type: 'above_threshold',
          severity: 'warning',
          acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null,
          metadata: { team_avg: teamMetrics.revisionRate },
        });
      }
    }

    // Cycle time: flag if user cycle time > team avg * multiplier
    if (thresholds.cycleTime && teamMetrics.avgCycleTimeHours > 0) {
      const warningThreshold = teamMetrics.avgCycleTimeHours * thresholds.cycleTime.warning;
      if (userMetrics.avgCycleTimeHours > warningThreshold) {
        alerts.push({
          board_id: boardId,
          user_id: userId,
          metric_name: 'cycle_time',
          current_value: userMetrics.avgCycleTimeHours,
          threshold_value: warningThreshold,
          alert_type: 'above_threshold',
          severity: 'warning',
          acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null,
          metadata: { team_avg: teamMetrics.avgCycleTimeHours },
        });
      }
    }

    // On-time rate: flag if below absolute floor
    if (thresholds.onTimeRate) {
      const criticalFloor = thresholds.onTimeRate.critical ?? 0;
      const warningFloor = thresholds.onTimeRate.warning;
      if (userMetrics.onTimeRate < criticalFloor && userMetrics.onTimeRate > 0) {
        alerts.push({
          board_id: boardId,
          user_id: userId,
          metric_name: 'on_time_rate',
          current_value: userMetrics.onTimeRate,
          threshold_value: criticalFloor,
          alert_type: 'below_threshold',
          severity: 'critical',
          acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null,
          metadata: {},
        });
      } else if (userMetrics.onTimeRate < warningFloor && userMetrics.onTimeRate > 0) {
        alerts.push({
          board_id: boardId,
          user_id: userId,
          metric_name: 'on_time_rate',
          current_value: userMetrics.onTimeRate,
          threshold_value: warningFloor,
          alert_type: 'below_threshold',
          severity: 'warning',
          acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null,
          metadata: {},
        });
      }
    }

    // AI pass rate: flag if below absolute floor
    if (thresholds.aiPassRate && userMetrics.aiPassRate > 0) {
      const warningFloor = thresholds.aiPassRate.warning;
      if (userMetrics.aiPassRate < warningFloor) {
        alerts.push({
          board_id: boardId,
          user_id: userId,
          metric_name: 'ai_pass_rate',
          current_value: userMetrics.aiPassRate,
          threshold_value: warningFloor,
          alert_type: 'below_threshold',
          severity: 'warning',
          acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null,
          metadata: {},
        });
      }
    }
  }

  return alerts;
}

export async function storeAlerts(
  supabase: SupabaseClient,
  alerts: Omit<ProductivityAlert, 'id' | 'created_at'>[]
): Promise<number> {
  if (alerts.length === 0) return 0;

  const rows = alerts.map((a) => ({
    board_id: a.board_id,
    user_id: a.user_id,
    metric_name: a.metric_name,
    current_value: a.current_value,
    threshold_value: a.threshold_value,
    alert_type: a.alert_type,
    severity: a.severity,
    acknowledged: false,
    metadata: a.metadata,
  }));

  const { data, error } = await supabase.from('productivity_alerts').insert(rows).select('id');
  if (error) return 0;
  return data?.length ?? 0;
}

export async function getAlerts(
  supabase: SupabaseClient,
  filters: {
    boardId?: string;
    userId?: string;
    severity?: string;
    acknowledged?: boolean;
    limit?: number;
  }
): Promise<ProductivityAlert[]> {
  let query = supabase
    .from('productivity_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.boardId) query = query.eq('board_id', filters.boardId);
  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.severity) query = query.eq('severity', filters.severity);
  if (filters.acknowledged !== undefined) query = query.eq('acknowledged', filters.acknowledged);

  const { data } = await query;
  return (data as ProductivityAlert[]) ?? [];
}

export async function acknowledgeAlert(
  supabase: SupabaseClient,
  alertId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('productivity_alerts')
    .update({
      acknowledged: true,
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', alertId);

  return !error;
}

// ============================================================================
// DEPARTMENT ROLLUP (P9.1)
// ============================================================================

const BOARD_TYPE_TO_DEPARTMENT: Record<string, string> = {
  design: 'Design',
  development: 'Development',
  account_management: 'Account Management',
  video_editing: 'Video Editing',
  video_training: 'Video Training',
  social_media: 'Social Media',
  content: 'Content',
  general: 'General',
};

export async function getDepartmentRollup(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
  comparePrevious?: boolean
): Promise<DepartmentRollup[]> {
  // Get all boards with their types
  const { data: boards } = await supabase
    .from('boards')
    .select('id, type, name')
    .eq('is_archived', false);

  if (!boards || boards.length === 0) return [];

  // Get member counts per board
  const { data: members } = await supabase
    .from('board_members')
    .select('board_id, user_id');

  const memberCountByBoard = new Map<string, number>();
  if (members) {
    for (const m of members) {
      memberCountByBoard.set(m.board_id, (memberCountByBoard.get(m.board_id) ?? 0) + 1);
    }
  }

  // Get snapshots for the date range
  const snapshots = await getProductivitySnapshots(supabase, { startDate, endDate });

  // Group snapshots by board
  const snapshotsByBoard = new Map<string, ProductivitySnapshot[]>();
  for (const s of snapshots) {
    if (!s.board_id) continue;
    const existing = snapshotsByBoard.get(s.board_id) ?? [];
    existing.push(s);
    snapshotsByBoard.set(s.board_id, existing);
  }

  // Build department rollups
  const rollups: DepartmentRollup[] = [];

  for (const board of boards) {
    const boardType = board.type ?? 'general';
    const department = BOARD_TYPE_TO_DEPARTMENT[boardType] ?? boardType;
    const boardSnapshots = snapshotsByBoard.get(board.id) ?? [];
    const metrics = aggregateSnapshots(boardSnapshots);

    let previousMetrics: ProductivityMetrics | undefined;
    if (comparePrevious) {
      // Calculate same-length previous period
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      const periodMs = endMs - startMs;
      const prevStart = new Date(startMs - periodMs).toISOString().split('T')[0];
      const prevEnd = new Date(startMs - 1).toISOString().split('T')[0];

      const prevSnapshots = await getProductivitySnapshots(supabase, {
        startDate: prevStart,
        endDate: prevEnd,
        boardId: board.id,
      });
      previousMetrics = aggregateSnapshots(prevSnapshots);
    }

    rollups.push({
      department,
      boardType,
      metrics,
      memberCount: memberCountByBoard.get(board.id) ?? 0,
      previousMetrics,
    });
  }

  return rollups;
}

// ============================================================================
// NIGHTLY SNAPSHOT COMPUTATION (P9.1)
// ============================================================================

export async function computeNightlySnapshots(
  supabase: SupabaseClient,
  snapshotDate: string
): Promise<{ snapshotsCreated: number; alertsGenerated: number }> {
  // Get all active boards
  const { data: boards } = await supabase
    .from('boards')
    .select('id, type, name')
    .eq('is_archived', false);

  if (!boards || boards.length === 0) return { snapshotsCreated: 0, alertsGenerated: 0 };

  let snapshotsCreated = 0;
  let totalAlerts = 0;

  for (const board of boards) {
    // Get all board members
    const { data: boardMembers } = await supabase
      .from('board_members')
      .select('user_id')
      .eq('board_id', board.id);

    if (!boardMembers || boardMembers.length === 0) continue;

    // Get today's card completions (activity log)
    const dayStart = `${snapshotDate}T00:00:00Z`;
    const dayEnd = `${snapshotDate}T23:59:59Z`;

    const { data: completions } = await supabase
      .from('activity_log')
      .select('card_id, metadata')
      .eq('board_id', board.id)
      .eq('event_type', 'card_completed')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);

    const { data: creations } = await supabase
      .from('activity_log')
      .select('card_id')
      .eq('board_id', board.id)
      .eq('event_type', 'card_created')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);

    // Get column history for cycle time calc
    const { data: columnHistory } = await supabase
      .from('card_column_history')
      .select('*')
      .eq('board_id', board.id)
      .gte('moved_at', dayStart)
      .lte('moved_at', dayEnd)
      .order('moved_at', { ascending: true });

    // Compute per-user metrics for the day
    const boardSnapshots: ProductivitySnapshot[] = [];

    for (const member of boardMembers) {
      // Count completions by this user
      const userCompletions = (completions ?? []).filter(
        (c: any) => c.metadata?.user_id === member.user_id
      );

      // Count cards created by this user
      const userCreations = (creations ?? []).filter(
        (c: any) => c.metadata?.user_id === member.user_id
      );

      // Calculate cycle time for completed cards
      const completedCardIds = userCompletions.map((c: any) => c.card_id);
      const cardHistories = (columnHistory ?? []).filter((h: any) =>
        completedCardIds.includes(h.card_id)
      );
      const byCard = new Map<string, CardColumnHistory[]>();
      for (const h of cardHistories) {
        const existing = byCard.get(h.card_id) ?? [];
        existing.push(h as CardColumnHistory);
        byCard.set(h.card_id, existing);
      }
      const cycleTimes = Array.from(byCard.values())
        .map((h) => calculateCycleTime(h))
        .filter((t): t is number => t !== null);
      const avgCycleTime = cycleTimes.length > 0
        ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
        : null;

      // Revision rate from column history
      const histories = Array.from(byCard.values());
      const revisionRate = calculateRevisionRate(histories);

      // Create snapshot
      const snapshot = await createProductivitySnapshot(supabase, {
        snapshotDate,
        userId: member.user_id,
        boardId: board.id,
        department: BOARD_TYPE_TO_DEPARTMENT[board.type ?? 'general'] ?? board.type,
        ticketsCompleted: userCompletions.length,
        ticketsCreated: userCreations.length,
        avgCycleTimeHours: avgCycleTime ? Math.round(avgCycleTime * 100) / 100 : undefined,
        onTimeRate: undefined, // Would need due_date data per card
        revisionRate: revisionRate > 0 ? revisionRate : undefined,
      });

      if (snapshot) {
        snapshotsCreated++;
        boardSnapshots.push(snapshot);
      }
    }

    // Generate alerts for this board
    if (boardSnapshots.length > 0) {
      const alerts = generateAlerts(boardSnapshots);
      const stored = await storeAlerts(supabase, alerts);
      totalAlerts += stored;
    }
  }

  return { snapshotsCreated, alertsGenerated: totalAlerts };
}
