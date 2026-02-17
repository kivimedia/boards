import { SupabaseClient } from '@supabase/supabase-js';
import {
  getProductivitySnapshots,
  aggregateSnapshots,
  buildUserScorecards,
  getDepartmentRollup,
} from './productivity-analytics';
import type {
  ProductivitySnapshot,
  ProductivityMetrics,
  UserScorecard,
  DepartmentRollup,
} from './types';

// ============================================================================
// REPORT DATA STRUCTURES
// ============================================================================

export interface IndividualReport {
  type: 'individual';
  userId: string;
  userName: string;
  period: { start: string; end: string };
  metrics: ProductivityMetrics;
  previousMetrics?: ProductivityMetrics;
  dailyTrend: { date: string; completed: number; cycleTime: number | null }[];
}

export interface TeamReport {
  type: 'team';
  period: { start: string; end: string };
  scorecards: UserScorecard[];
  teamMetrics: ProductivityMetrics;
}

export interface DepartmentReport {
  type: 'department';
  period: { start: string; end: string };
  departments: DepartmentRollup[];
}

export interface ExecutiveReport {
  type: 'executive';
  period: { start: string; end: string };
  teamMetrics: ProductivityMetrics;
  previousTeamMetrics?: ProductivityMetrics;
  departments: DepartmentRollup[];
  topPerformers: UserScorecard[];
  riskFlags: { userId: string; userName: string; metric: string; value: number; threshold: number }[];
}

export type ProductivityReportData =
  | IndividualReport
  | TeamReport
  | DepartmentReport
  | ExecutiveReport;

// ============================================================================
// REPORT GENERATION
// ============================================================================

export async function generateIndividualReport(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string,
  comparePrevious?: boolean
): Promise<IndividualReport> {
  // Get user's name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single();

  const snapshots = await getProductivitySnapshots(supabase, {
    startDate,
    endDate,
    userId,
  });

  const metrics = aggregateSnapshots(snapshots);

  // Build daily trend
  const dailyTrend = snapshots.map((s: ProductivitySnapshot) => ({
    date: s.snapshot_date,
    completed: s.tickets_completed,
    cycleTime: s.avg_cycle_time_hours,
  }));

  let previousMetrics: ProductivityMetrics | undefined;
  if (comparePrevious) {
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const periodMs = endMs - startMs;
    const prevStart = new Date(startMs - periodMs).toISOString().split('T')[0];
    const prevEnd = new Date(startMs - 1).toISOString().split('T')[0];

    const prevSnapshots = await getProductivitySnapshots(supabase, {
      startDate: prevStart,
      endDate: prevEnd,
      userId,
    });
    previousMetrics = aggregateSnapshots(prevSnapshots);
  }

  return {
    type: 'individual',
    userId,
    userName: profile?.display_name ?? 'Unknown',
    period: { start: startDate, end: endDate },
    metrics,
    previousMetrics,
    dailyTrend,
  };
}

export async function generateTeamReport(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<TeamReport> {
  const snapshots = await getProductivitySnapshots(supabase, {
    startDate,
    endDate,
  });

  const teamMetrics = aggregateSnapshots(snapshots);

  // Group by user
  const byUser = new Map<string, ProductivitySnapshot[]>();
  for (const s of snapshots) {
    if (!s.user_id) continue;
    const existing = byUser.get(s.user_id) ?? [];
    existing.push(s);
    byUser.set(s.user_id, existing);
  }

  // Get user names
  const userIds = Array.from(byUser.keys());
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);

  const userNames = new Map(
    (profiles ?? []).map((p: { id: string; display_name: string }) => [p.id, p.display_name ?? 'Unknown'])
  );

  const scorecards = buildUserScorecards(byUser, userNames);

  return {
    type: 'team',
    period: { start: startDate, end: endDate },
    scorecards,
    teamMetrics,
  };
}

export async function generateDepartmentReport(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
  comparePrevious?: boolean
): Promise<DepartmentReport> {
  const departments = await getDepartmentRollup(supabase, startDate, endDate, comparePrevious);

  return {
    type: 'department',
    period: { start: startDate, end: endDate },
    departments,
  };
}

export async function generateExecutiveReport(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<ExecutiveReport> {
  const [teamReport, deptReport] = await Promise.all([
    generateTeamReport(supabase, startDate, endDate),
    generateDepartmentReport(supabase, startDate, endDate, true),
  ]);

  // Calculate previous team metrics
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const periodMs = endMs - startMs;
  const prevStart = new Date(startMs - periodMs).toISOString().split('T')[0];
  const prevEnd = new Date(startMs - 1).toISOString().split('T')[0];

  const prevSnapshots = await getProductivitySnapshots(supabase, {
    startDate: prevStart,
    endDate: prevEnd,
  });
  const previousTeamMetrics = aggregateSnapshots(prevSnapshots);

  // Top 5 performers
  const topPerformers = teamReport.scorecards.slice(0, 5);

  // Risk flags: anyone with poor metrics
  const riskFlags: ExecutiveReport['riskFlags'] = [];
  for (const sc of teamReport.scorecards) {
    if (sc.metrics.onTimeRate > 0 && sc.metrics.onTimeRate < 60) {
      riskFlags.push({
        userId: sc.userId,
        userName: sc.userName,
        metric: 'On-time rate',
        value: sc.metrics.onTimeRate,
        threshold: 60,
      });
    }
    if (sc.metrics.revisionRate > 50) {
      riskFlags.push({
        userId: sc.userId,
        userName: sc.userName,
        metric: 'Revision rate',
        value: sc.metrics.revisionRate,
        threshold: 50,
      });
    }
  }

  return {
    type: 'executive',
    period: { start: startDate, end: endDate },
    teamMetrics: teamReport.teamMetrics,
    previousTeamMetrics,
    departments: deptReport.departments,
    topPerformers,
    riskFlags,
  };
}

// ============================================================================
// CSV EXPORT
// ============================================================================

export function reportToCSV(report: ProductivityReportData): string {
  if (report.type === 'individual') {
    const header = 'Date,Tickets Completed,Cycle Time (hrs)';
    const rows = report.dailyTrend.map((d) =>
      `${d.date},${d.completed},${d.cycleTime ?? ''}`
    );
    const summary = [
      '',
      'Summary',
      `Total Completed,${report.metrics.ticketsCompleted}`,
      `Avg Cycle Time (hrs),${report.metrics.avgCycleTimeHours}`,
      `On-time Rate (%),${report.metrics.onTimeRate}`,
      `Revision Rate (%),${report.metrics.revisionRate}`,
      `AI Pass Rate (%),${report.metrics.aiPassRate}`,
    ];
    return [header, ...rows, ...summary].join('\n');
  }

  if (report.type === 'team') {
    const header = 'Rank,Name,Tickets Completed,Avg Cycle Time (hrs),On-time Rate (%),Revision Rate (%),AI Pass Rate (%)';
    const rows = report.scorecards.map((sc) =>
      `${sc.rank},${sc.userName},${sc.metrics.ticketsCompleted},${sc.metrics.avgCycleTimeHours},${sc.metrics.onTimeRate},${sc.metrics.revisionRate},${sc.metrics.aiPassRate}`
    );
    return [header, ...rows].join('\n');
  }

  if (report.type === 'department') {
    const header = 'Department,Members,Tickets Completed,Avg Cycle Time (hrs),On-time Rate (%),Revision Rate (%)';
    const rows = report.departments.map((d) =>
      `${d.department},${d.memberCount},${d.metrics.ticketsCompleted},${d.metrics.avgCycleTimeHours},${d.metrics.onTimeRate},${d.metrics.revisionRate}`
    );
    return [header, ...rows].join('\n');
  }

  if (report.type === 'executive') {
    const lines = [
      'Executive Summary',
      `Period,${report.period.start} - ${report.period.end}`,
      '',
      'Team Metrics',
      `Tickets Completed,${report.teamMetrics.ticketsCompleted}`,
      `Avg Cycle Time (hrs),${report.teamMetrics.avgCycleTimeHours}`,
      `On-time Rate (%),${report.teamMetrics.onTimeRate}`,
      '',
      'Top Performers',
      'Name,Tickets Completed,On-time Rate (%)',
      ...report.topPerformers.map((p) => `${p.userName},${p.metrics.ticketsCompleted},${p.metrics.onTimeRate}`),
      '',
      'Risk Flags',
      'Name,Metric,Value,Threshold',
      ...report.riskFlags.map((r) => `${r.userName},${r.metric},${r.value},${r.threshold}`),
    ];
    return lines.join('\n');
  }

  return '';
}
