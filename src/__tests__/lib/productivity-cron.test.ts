import { describe, it, expect } from 'vitest';
import {
  generateAlerts,
  aggregateSnapshots,
  calculateCycleTime,
  calculateOnTimeRate,
  calculateRevisionRate,
  calculateNextSendAt,
  type AlertThresholds,
} from '@/lib/productivity-analytics';
import type { ProductivitySnapshot, CardColumnHistory } from '@/lib/types';

// ============================================================================
// HELPERS
// ============================================================================

function makeSnapshot(overrides: Partial<ProductivitySnapshot> = {}): ProductivitySnapshot {
  return {
    id: 'snap-1',
    snapshot_date: '2026-02-15',
    user_id: 'user-1',
    board_id: 'board-1',
    department: 'Design',
    tickets_completed: 5,
    tickets_created: 3,
    avg_cycle_time_hours: 24,
    on_time_rate: 80,
    revision_rate: 20,
    ai_pass_rate: 75,
    total_time_logged_minutes: 480,
    metadata: {},
    created_at: '2026-02-15T02:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// generateAlerts
// ============================================================================

describe('generateAlerts', () => {
  it('returns empty array for empty snapshots', () => {
    const alerts = generateAlerts([]);
    expect(alerts).toEqual([]);
  });

  it('returns empty array when no thresholds exceeded', () => {
    const snapshots = [
      makeSnapshot({ user_id: 'user-1', revision_rate: 10 }),
      makeSnapshot({ user_id: 'user-2', revision_rate: 12 }),
    ];
    const alerts = generateAlerts(snapshots);
    // Revision rates are close to team avg, no alerts
    expect(alerts.length).toBe(0);
  });

  it('generates revision rate alert when user exceeds 1.5x team average', () => {
    const snapshots = [
      makeSnapshot({ user_id: 'user-1', revision_rate: 10 }),
      makeSnapshot({ user_id: 'user-2', revision_rate: 10 }),
      makeSnapshot({ user_id: 'user-3', revision_rate: 50 }), // way above avg
    ];
    const alerts = generateAlerts(snapshots);
    const revisionAlerts = alerts.filter(a => a.metric_name === 'revision_rate');
    expect(revisionAlerts.length).toBeGreaterThanOrEqual(1);
    expect(revisionAlerts[0].user_id).toBe('user-3');
    expect(revisionAlerts[0].severity).toBe('warning');
    expect(revisionAlerts[0].alert_type).toBe('above_threshold');
  });

  it('generates cycle time alert when user exceeds 2x team average', () => {
    const snapshots = [
      makeSnapshot({ user_id: 'user-1', avg_cycle_time_hours: 10 }),
      makeSnapshot({ user_id: 'user-2', avg_cycle_time_hours: 12 }),
      makeSnapshot({ user_id: 'user-3', avg_cycle_time_hours: 80 }), // way above avg
    ];
    const alerts = generateAlerts(snapshots);
    const cycleAlerts = alerts.filter(a => a.metric_name === 'cycle_time');
    expect(cycleAlerts.length).toBeGreaterThanOrEqual(1);
    expect(cycleAlerts[0].user_id).toBe('user-3');
  });

  it('generates on-time rate warning when below 60%', () => {
    const snapshots = [
      makeSnapshot({ user_id: 'user-1', on_time_rate: 55 }),
    ];
    const alerts = generateAlerts(snapshots);
    const onTimeAlerts = alerts.filter(a => a.metric_name === 'on_time_rate');
    expect(onTimeAlerts.length).toBe(1);
    expect(onTimeAlerts[0].severity).toBe('warning');
    expect(onTimeAlerts[0].alert_type).toBe('below_threshold');
  });

  it('generates on-time rate critical when below 40%', () => {
    const snapshots = [
      makeSnapshot({ user_id: 'user-1', on_time_rate: 35 }),
    ];
    const alerts = generateAlerts(snapshots);
    const onTimeAlerts = alerts.filter(a => a.metric_name === 'on_time_rate');
    expect(onTimeAlerts.length).toBe(1);
    expect(onTimeAlerts[0].severity).toBe('critical');
  });

  it('generates AI pass rate alert when below 50%', () => {
    const snapshots = [
      makeSnapshot({ user_id: 'user-1', ai_pass_rate: 40 }),
    ];
    const alerts = generateAlerts(snapshots);
    const aiAlerts = alerts.filter(a => a.metric_name === 'ai_pass_rate');
    expect(aiAlerts.length).toBe(1);
    expect(aiAlerts[0].severity).toBe('warning');
  });

  it('skips users without user_id', () => {
    const snapshots = [
      makeSnapshot({ user_id: null, revision_rate: 90 }),
    ];
    const alerts = generateAlerts(snapshots);
    expect(alerts.length).toBe(0);
  });

  it('respects custom thresholds', () => {
    const snapshots = [
      makeSnapshot({ user_id: 'user-1', on_time_rate: 75 }),
    ];
    const thresholds: AlertThresholds = {
      onTimeRate: { warning: 80, critical: 50 },
    };
    const alerts = generateAlerts(snapshots, thresholds);
    const onTimeAlerts = alerts.filter(a => a.metric_name === 'on_time_rate');
    expect(onTimeAlerts.length).toBe(1);
    expect(onTimeAlerts[0].threshold_value).toBe(80);
  });
});

// ============================================================================
// aggregateSnapshots
// ============================================================================

describe('aggregateSnapshots', () => {
  it('returns zeros for empty array', () => {
    const result = aggregateSnapshots([]);
    expect(result.ticketsCompleted).toBe(0);
    expect(result.avgCycleTimeHours).toBe(0);
    expect(result.onTimeRate).toBe(0);
  });

  it('sums tickets and averages rates', () => {
    const snapshots = [
      makeSnapshot({ tickets_completed: 10, on_time_rate: 80, revision_rate: 20 }),
      makeSnapshot({ tickets_completed: 5, on_time_rate: 60, revision_rate: 40 }),
    ];
    const result = aggregateSnapshots(snapshots);
    expect(result.ticketsCompleted).toBe(15);
    expect(result.onTimeRate).toBe(70); // avg of 80 and 60
    expect(result.revisionRate).toBe(30); // avg of 20 and 40
  });

  it('handles null values in cycle time', () => {
    const snapshots = [
      makeSnapshot({ avg_cycle_time_hours: null }),
      makeSnapshot({ avg_cycle_time_hours: 48 }),
    ];
    const result = aggregateSnapshots(snapshots);
    expect(result.avgCycleTimeHours).toBe(48);
  });
});

// ============================================================================
// calculateCycleTime
// ============================================================================

describe('calculateCycleTime', () => {
  it('returns null for fewer than 2 entries', () => {
    expect(calculateCycleTime([])).toBeNull();
    expect(calculateCycleTime([{ moved_at: '2026-01-01T10:00:00Z' } as CardColumnHistory])).toBeNull();
  });

  it('calculates hours between first and last move', () => {
    const history: CardColumnHistory[] = [
      { moved_at: '2026-01-01T10:00:00Z' } as CardColumnHistory,
      { moved_at: '2026-01-01T14:00:00Z' } as CardColumnHistory,
    ];
    expect(calculateCycleTime(history)).toBe(4);
  });

  it('handles multi-day spans', () => {
    const history: CardColumnHistory[] = [
      { moved_at: '2026-01-01T10:00:00Z' } as CardColumnHistory,
      { moved_at: '2026-01-03T10:00:00Z' } as CardColumnHistory,
    ];
    expect(calculateCycleTime(history)).toBe(48);
  });
});

// ============================================================================
// calculateOnTimeRate
// ============================================================================

describe('calculateOnTimeRate', () => {
  it('returns 100 for no cards with due dates', () => {
    expect(calculateOnTimeRate([{ due_date: null, completed_at: null }])).toBe(100);
  });

  it('calculates percentage of on-time completions', () => {
    const cards = [
      { due_date: '2026-01-10', completed_at: '2026-01-09' }, // on time
      { due_date: '2026-01-10', completed_at: '2026-01-11' }, // late
    ];
    expect(calculateOnTimeRate(cards)).toBe(50);
  });

  it('ignores incomplete cards', () => {
    const cards = [
      { due_date: '2026-01-10', completed_at: null }, // not completed
    ];
    expect(calculateOnTimeRate(cards)).toBe(0);
  });
});

// ============================================================================
// calculateRevisionRate
// ============================================================================

describe('calculateRevisionRate', () => {
  it('returns 0 for empty histories', () => {
    expect(calculateRevisionRate([])).toBe(0);
  });

  it('calculates percentage of cards that entered revision', () => {
    const histories: CardColumnHistory[][] = [
      [{ to_list_name: 'In Progress' } as CardColumnHistory, { to_list_name: 'Revisions' } as CardColumnHistory],
      [{ to_list_name: 'In Progress' } as CardColumnHistory, { to_list_name: 'Done' } as CardColumnHistory],
    ];
    expect(calculateRevisionRate(histories)).toBe(50);
  });
});

// ============================================================================
// calculateNextSendAt
// ============================================================================

describe('calculateNextSendAt', () => {
  it('calculates next daily send time', () => {
    const next = calculateNextSendAt('daily');
    expect(new Date(next).getHours()).toBe(8);
  });

  it('calculates weekly send time', () => {
    const next = calculateNextSendAt('weekly:monday');
    const date = new Date(next);
    expect(date.getDay()).toBe(1); // Monday
  });

  it('calculates monthly send time', () => {
    const next = calculateNextSendAt('monthly:15');
    const date = new Date(next);
    expect(date.getDate()).toBe(15);
  });
});
