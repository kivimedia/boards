import { describe, it, expect } from 'vitest';
import {
  reportToCSV,
  type IndividualReport,
  type TeamReport,
  type DepartmentReport,
  type ExecutiveReport,
} from '@/lib/productivity-report-generator';

// ============================================================================
// reportToCSV - Individual
// ============================================================================

describe('reportToCSV - individual', () => {
  const report: IndividualReport = {
    type: 'individual',
    userId: 'user-1',
    userName: 'Alice',
    period: { start: '2026-01-01', end: '2026-01-31' },
    metrics: {
      ticketsCompleted: 20,
      ticketsCreated: 15,
      avgCycleTimeHours: 24,
      onTimeRate: 80,
      revisionRate: 15,
      aiPassRate: 90,
    },
    dailyTrend: [
      { date: '2026-01-01', completed: 2, cycleTime: 20 },
      { date: '2026-01-02', completed: 3, cycleTime: null },
    ],
  };

  it('generates CSV with header row', () => {
    const csv = reportToCSV(report);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Date,Tickets Completed,Cycle Time (hrs)');
  });

  it('includes daily trend data', () => {
    const csv = reportToCSV(report);
    expect(csv).toContain('2026-01-01,2,20');
    expect(csv).toContain('2026-01-02,3,');
  });

  it('includes summary metrics', () => {
    const csv = reportToCSV(report);
    expect(csv).toContain('Total Completed,20');
    expect(csv).toContain('Avg Cycle Time (hrs),24');
    expect(csv).toContain('On-time Rate (%),80');
  });
});

// ============================================================================
// reportToCSV - Team
// ============================================================================

describe('reportToCSV - team', () => {
  const report: TeamReport = {
    type: 'team',
    period: { start: '2026-01-01', end: '2026-01-31' },
    teamMetrics: {
      ticketsCompleted: 50,
      ticketsCreated: 40,
      avgCycleTimeHours: 20,
      onTimeRate: 75,
      revisionRate: 25,
      aiPassRate: 85,
    },
    scorecards: [
      {
        userId: 'user-1',
        userName: 'Alice',
        rank: 1,
        metrics: { ticketsCompleted: 30, ticketsCreated: 20, avgCycleTimeHours: 18, onTimeRate: 90, revisionRate: 10, aiPassRate: 95 },
        trend: [],
      },
      {
        userId: 'user-2',
        userName: 'Bob',
        rank: 2,
        metrics: { ticketsCompleted: 20, ticketsCreated: 20, avgCycleTimeHours: 22, onTimeRate: 60, revisionRate: 40, aiPassRate: 75 },
        trend: [],
      },
    ],
  };

  it('generates CSV with ranked header', () => {
    const csv = reportToCSV(report);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Rank,Name,Tickets Completed');
  });

  it('includes all team members', () => {
    const csv = reportToCSV(report);
    expect(csv).toContain('1,Alice,30');
    expect(csv).toContain('2,Bob,20');
  });
});

// ============================================================================
// reportToCSV - Department
// ============================================================================

describe('reportToCSV - department', () => {
  const report: DepartmentReport = {
    type: 'department',
    period: { start: '2026-01-01', end: '2026-01-31' },
    departments: [
      {
        department: 'Design',
        boardType: 'design',
        memberCount: 5,
        metrics: { ticketsCompleted: 100, ticketsCreated: 80, avgCycleTimeHours: 16, onTimeRate: 85, revisionRate: 20, aiPassRate: 0 },
      },
      {
        department: 'Development',
        boardType: 'development',
        memberCount: 3,
        metrics: { ticketsCompleted: 60, ticketsCreated: 50, avgCycleTimeHours: 24, onTimeRate: 70, revisionRate: 15, aiPassRate: 80 },
      },
    ],
  };

  it('generates CSV with department header', () => {
    const csv = reportToCSV(report);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Department,Members');
  });

  it('includes department data', () => {
    const csv = reportToCSV(report);
    expect(csv).toContain('Design,5,100');
    expect(csv).toContain('Development,3,60');
  });
});

// ============================================================================
// reportToCSV - Executive
// ============================================================================

describe('reportToCSV - executive', () => {
  const report: ExecutiveReport = {
    type: 'executive',
    period: { start: '2026-01-01', end: '2026-01-31' },
    teamMetrics: { ticketsCompleted: 150, ticketsCreated: 120, avgCycleTimeHours: 20, onTimeRate: 78, revisionRate: 22, aiPassRate: 85 },
    previousTeamMetrics: { ticketsCompleted: 130, ticketsCreated: 100, avgCycleTimeHours: 22, onTimeRate: 72, revisionRate: 28, aiPassRate: 80 },
    departments: [],
    topPerformers: [
      { userId: 'u1', userName: 'Alice', rank: 1, metrics: { ticketsCompleted: 40, ticketsCreated: 30, avgCycleTimeHours: 16, onTimeRate: 95, revisionRate: 5, aiPassRate: 98 }, trend: [] },
    ],
    riskFlags: [
      { userId: 'u2', userName: 'Bob', metric: 'On-time rate', value: 45, threshold: 60 },
    ],
  };

  it('generates executive summary CSV', () => {
    const csv = reportToCSV(report);
    expect(csv).toContain('Executive Summary');
    expect(csv).toContain('Tickets Completed,150');
  });

  it('includes top performers', () => {
    const csv = reportToCSV(report);
    expect(csv).toContain('Alice,40,95');
  });

  it('includes risk flags', () => {
    const csv = reportToCSV(report);
    expect(csv).toContain('Bob,On-time rate,45,60');
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('reportToCSV - edge cases', () => {
  it('handles empty individual trend', () => {
    const report: IndividualReport = {
      type: 'individual',
      userId: 'u1',
      userName: 'Test',
      period: { start: '2026-01-01', end: '2026-01-31' },
      metrics: { ticketsCompleted: 0, ticketsCreated: 0, avgCycleTimeHours: 0, onTimeRate: 0, revisionRate: 0, aiPassRate: 0 },
      dailyTrend: [],
    };
    const csv = reportToCSV(report);
    expect(csv).toContain('Total Completed,0');
  });

  it('handles team report with no scorecards', () => {
    const report: TeamReport = {
      type: 'team',
      period: { start: '2026-01-01', end: '2026-01-31' },
      teamMetrics: { ticketsCompleted: 0, ticketsCreated: 0, avgCycleTimeHours: 0, onTimeRate: 0, revisionRate: 0, aiPassRate: 0 },
      scorecards: [],
    };
    const csv = reportToCSV(report);
    const lines = csv.split('\n');
    expect(lines.length).toBe(1); // header only
  });
});
