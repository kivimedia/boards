import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateCycleTime,
  calculateOnTimeRate,
  calculateRevisionRate,
  aggregateSnapshots,
  buildUserScorecards,
  calculateNextSendAt,
  logColumnMove,
  getCardColumnHistory,
  getBoardColumnHistory,
  getProductivitySnapshots,
  createProductivitySnapshot,
  getScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
} from '../../lib/productivity-analytics';
import type { CardColumnHistory, ProductivitySnapshot } from '@/lib/types';

// ============================================================================
// Mock Supabase
// ============================================================================

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chainable: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return {
    from: vi.fn(() => chainable),
    _chain: chainable,
  } as unknown as ReturnType<typeof vi.fn> & { _chain: Record<string, unknown>; from: ReturnType<typeof vi.fn> };
}

// ============================================================================
// calculateCycleTime
// ============================================================================

describe('calculateCycleTime', () => {
  it('returns null when history has fewer than 2 entries', () => {
    expect(calculateCycleTime([])).toBeNull();
    expect(
      calculateCycleTime([
        {
          id: '1',
          card_id: 'c1',
          board_id: 'b1',
          from_list_id: null,
          to_list_id: 'l1',
          from_list_name: null,
          to_list_name: 'To Do',
          moved_by: null,
          moved_at: '2025-06-01T09:00:00Z',
        },
      ])
    ).toBeNull();
  });

  it('calculates cycle time in hours between first and last move', () => {
    const history: CardColumnHistory[] = [
      {
        id: '1', card_id: 'c1', board_id: 'b1', from_list_id: null, to_list_id: 'l1',
        from_list_name: null, to_list_name: 'To Do', moved_by: null,
        moved_at: '2025-06-01T09:00:00Z',
      },
      {
        id: '2', card_id: 'c1', board_id: 'b1', from_list_id: 'l1', to_list_id: 'l2',
        from_list_name: 'To Do', to_list_name: 'In Progress', moved_by: null,
        moved_at: '2025-06-01T13:00:00Z',
      },
    ];
    // 4 hours difference
    expect(calculateCycleTime(history)).toBe(4);
  });

  it('handles fractional hours', () => {
    const history: CardColumnHistory[] = [
      {
        id: '1', card_id: 'c1', board_id: 'b1', from_list_id: null, to_list_id: 'l1',
        from_list_name: null, to_list_name: 'To Do', moved_by: null,
        moved_at: '2025-06-01T09:00:00Z',
      },
      {
        id: '2', card_id: 'c1', board_id: 'b1', from_list_id: 'l1', to_list_id: 'l2',
        from_list_name: 'To Do', to_list_name: 'Done', moved_by: null,
        moved_at: '2025-06-01T10:30:00Z',
      },
    ];
    expect(calculateCycleTime(history)).toBe(1.5);
  });

  it('uses the last entry for multi-step histories', () => {
    const history: CardColumnHistory[] = [
      {
        id: '1', card_id: 'c1', board_id: 'b1', from_list_id: null, to_list_id: 'l1',
        from_list_name: null, to_list_name: 'To Do', moved_by: null,
        moved_at: '2025-06-01T08:00:00Z',
      },
      {
        id: '2', card_id: 'c1', board_id: 'b1', from_list_id: 'l1', to_list_id: 'l2',
        from_list_name: 'To Do', to_list_name: 'In Progress', moved_by: null,
        moved_at: '2025-06-01T12:00:00Z',
      },
      {
        id: '3', card_id: 'c1', board_id: 'b1', from_list_id: 'l2', to_list_id: 'l3',
        from_list_name: 'In Progress', to_list_name: 'Done', moved_by: null,
        moved_at: '2025-06-02T08:00:00Z',
      },
    ];
    // 24 hours from first to last
    expect(calculateCycleTime(history)).toBe(24);
  });

  it('returns 0 when first and last move timestamps are the same', () => {
    const ts = '2025-06-01T09:00:00Z';
    const history: CardColumnHistory[] = [
      {
        id: '1', card_id: 'c1', board_id: 'b1', from_list_id: null, to_list_id: 'l1',
        from_list_name: null, to_list_name: 'A', moved_by: null, moved_at: ts,
      },
      {
        id: '2', card_id: 'c1', board_id: 'b1', from_list_id: 'l1', to_list_id: 'l2',
        from_list_name: 'A', to_list_name: 'B', moved_by: null, moved_at: ts,
      },
    ];
    expect(calculateCycleTime(history)).toBe(0);
  });
});

// ============================================================================
// calculateOnTimeRate
// ============================================================================

describe('calculateOnTimeRate', () => {
  it('returns 100 when no cards have due dates', () => {
    const cards = [
      { due_date: null, completed_at: '2025-06-01T10:00:00Z' },
      { due_date: null, completed_at: null },
    ];
    expect(calculateOnTimeRate(cards)).toBe(100);
  });

  it('returns 100 when all cards are on time', () => {
    const cards = [
      { due_date: '2025-06-05', completed_at: '2025-06-04T10:00:00Z' },
      { due_date: '2025-06-10', completed_at: '2025-06-09T12:00:00Z' },
    ];
    expect(calculateOnTimeRate(cards)).toBe(100);
  });

  it('returns 0 when no cards are on time', () => {
    const cards = [
      { due_date: '2025-06-01', completed_at: '2025-06-05T10:00:00Z' },
      { due_date: '2025-06-02', completed_at: '2025-06-06T10:00:00Z' },
    ];
    expect(calculateOnTimeRate(cards)).toBe(0);
  });

  it('calculates mixed on-time/late percentages', () => {
    const cards = [
      { due_date: '2025-06-05', completed_at: '2025-06-04T10:00:00Z' },
      { due_date: '2025-06-05', completed_at: '2025-06-08T10:00:00Z' },
    ];
    expect(calculateOnTimeRate(cards)).toBe(50);
  });

  it('treats uncompleted cards with due dates as late', () => {
    const cards = [
      { due_date: '2025-06-05', completed_at: null },
      { due_date: '2025-06-05', completed_at: '2025-06-04T10:00:00Z' },
    ];
    expect(calculateOnTimeRate(cards)).toBe(50);
  });

  it('returns 100 for empty array', () => {
    expect(calculateOnTimeRate([])).toBe(100);
  });

  it('considers a card completed exactly on due date as on time', () => {
    const cards = [
      { due_date: '2025-06-05T00:00:00Z', completed_at: '2025-06-05T00:00:00Z' },
    ];
    expect(calculateOnTimeRate(cards)).toBe(100);
  });
});

// ============================================================================
// calculateRevisionRate
// ============================================================================

describe('calculateRevisionRate', () => {
  it('returns 0 for empty histories array', () => {
    expect(calculateRevisionRate([])).toBe(0);
  });

  it('returns 100 when all cards went through revisions', () => {
    const histories: CardColumnHistory[][] = [
      [
        {
          id: '1', card_id: 'c1', board_id: 'b1', from_list_id: null, to_list_id: 'l1',
          from_list_name: null, to_list_name: 'In Progress', moved_by: null,
          moved_at: '2025-06-01T09:00:00Z',
        },
        {
          id: '2', card_id: 'c1', board_id: 'b1', from_list_id: 'l1', to_list_id: 'l2',
          from_list_name: 'In Progress', to_list_name: 'Revisions', moved_by: null,
          moved_at: '2025-06-02T09:00:00Z',
        },
      ],
    ];
    expect(calculateRevisionRate(histories)).toBe(100);
  });

  it('returns 0 when no cards went through revisions', () => {
    const histories: CardColumnHistory[][] = [
      [
        {
          id: '1', card_id: 'c1', board_id: 'b1', from_list_id: null, to_list_id: 'l1',
          from_list_name: null, to_list_name: 'In Progress', moved_by: null,
          moved_at: '2025-06-01T09:00:00Z',
        },
        {
          id: '2', card_id: 'c1', board_id: 'b1', from_list_id: 'l1', to_list_id: 'l2',
          from_list_name: 'In Progress', to_list_name: 'Done', moved_by: null,
          moved_at: '2025-06-02T09:00:00Z',
        },
      ],
    ];
    expect(calculateRevisionRate(histories)).toBe(0);
  });

  it('calculates correct percentage for mixed histories', () => {
    const histories: CardColumnHistory[][] = [
      [
        {
          id: '1', card_id: 'c1', board_id: 'b1', from_list_id: null, to_list_id: 'l1',
          from_list_name: null, to_list_name: 'Revisions', moved_by: null,
          moved_at: '2025-06-01T09:00:00Z',
        },
      ],
      [
        {
          id: '2', card_id: 'c2', board_id: 'b1', from_list_id: null, to_list_id: 'l2',
          from_list_name: null, to_list_name: 'Done', moved_by: null,
          moved_at: '2025-06-01T09:00:00Z',
        },
      ],
      [
        {
          id: '3', card_id: 'c3', board_id: 'b1', from_list_id: null, to_list_id: 'l3',
          from_list_name: null, to_list_name: 'Done', moved_by: null,
          moved_at: '2025-06-01T09:00:00Z',
        },
      ],
    ];
    // 1 out of 3 = 33.33%
    expect(calculateRevisionRate(histories)).toBe(33.33);
  });

  it('recognizes custom revision column names', () => {
    const histories: CardColumnHistory[][] = [
      [
        {
          id: '1', card_id: 'c1', board_id: 'b1', from_list_id: null, to_list_id: 'l1',
          from_list_name: null, to_list_name: 'Changes Requested', moved_by: null,
          moved_at: '2025-06-01T09:00:00Z',
        },
      ],
    ];
    expect(calculateRevisionRate(histories)).toBe(100);
  });

  it('supports custom revision column name list', () => {
    const histories: CardColumnHistory[][] = [
      [
        {
          id: '1', card_id: 'c1', board_id: 'b1', from_list_id: null, to_list_id: 'l1',
          from_list_name: null, to_list_name: 'Rework', moved_by: null,
          moved_at: '2025-06-01T09:00:00Z',
        },
      ],
    ];
    // Default won't match "Rework"
    expect(calculateRevisionRate(histories)).toBe(0);
    // Custom list
    expect(calculateRevisionRate(histories, ['Rework'])).toBe(100);
  });
});

// ============================================================================
// aggregateSnapshots
// ============================================================================

describe('aggregateSnapshots', () => {
  it('returns zeroed metrics for empty snapshots', () => {
    const result = aggregateSnapshots([]);
    expect(result).toEqual({
      ticketsCompleted: 0,
      ticketsCreated: 0,
      avgCycleTimeHours: 0,
      onTimeRate: 0,
      revisionRate: 0,
      aiPassRate: 0,
    });
  });

  it('sums tickets completed and created', () => {
    const snapshots: ProductivitySnapshot[] = [
      {
        id: '1', snapshot_date: '2025-06-01', user_id: null, board_id: null, department: null,
        tickets_completed: 5, tickets_created: 3, avg_cycle_time_hours: null,
        on_time_rate: null, revision_rate: null, ai_pass_rate: null,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
      {
        id: '2', snapshot_date: '2025-06-02', user_id: null, board_id: null, department: null,
        tickets_completed: 8, tickets_created: 4, avg_cycle_time_hours: null,
        on_time_rate: null, revision_rate: null, ai_pass_rate: null,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
    ];
    const result = aggregateSnapshots(snapshots);
    expect(result.ticketsCompleted).toBe(13);
    expect(result.ticketsCreated).toBe(7);
  });

  it('averages cycle time ignoring nulls', () => {
    const snapshots: ProductivitySnapshot[] = [
      {
        id: '1', snapshot_date: '2025-06-01', user_id: null, board_id: null, department: null,
        tickets_completed: 5, tickets_created: 3, avg_cycle_time_hours: 10,
        on_time_rate: null, revision_rate: null, ai_pass_rate: null,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
      {
        id: '2', snapshot_date: '2025-06-02', user_id: null, board_id: null, department: null,
        tickets_completed: 5, tickets_created: 3, avg_cycle_time_hours: null,
        on_time_rate: null, revision_rate: null, ai_pass_rate: null,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
      {
        id: '3', snapshot_date: '2025-06-03', user_id: null, board_id: null, department: null,
        tickets_completed: 5, tickets_created: 3, avg_cycle_time_hours: 20,
        on_time_rate: null, revision_rate: null, ai_pass_rate: null,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
    ];
    const result = aggregateSnapshots(snapshots);
    // (10 + 20) / 2 = 15
    expect(result.avgCycleTimeHours).toBe(15);
  });

  it('averages on-time rate, revision rate, and AI pass rate', () => {
    const snapshots: ProductivitySnapshot[] = [
      {
        id: '1', snapshot_date: '2025-06-01', user_id: null, board_id: null, department: null,
        tickets_completed: 5, tickets_created: 3, avg_cycle_time_hours: 10,
        on_time_rate: 80, revision_rate: 20, ai_pass_rate: 90,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
      {
        id: '2', snapshot_date: '2025-06-02', user_id: null, board_id: null, department: null,
        tickets_completed: 5, tickets_created: 3, avg_cycle_time_hours: 10,
        on_time_rate: 60, revision_rate: 40, ai_pass_rate: 70,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
    ];
    const result = aggregateSnapshots(snapshots);
    expect(result.onTimeRate).toBe(70);
    expect(result.revisionRate).toBe(30);
    expect(result.aiPassRate).toBe(80);
  });

  it('handles single snapshot correctly', () => {
    const snapshots: ProductivitySnapshot[] = [
      {
        id: '1', snapshot_date: '2025-06-01', user_id: 'u1', board_id: null, department: null,
        tickets_completed: 10, tickets_created: 5, avg_cycle_time_hours: 24.5,
        on_time_rate: 85.5, revision_rate: 15.0, ai_pass_rate: 92.0,
        total_time_logged_minutes: 480, metadata: {}, created_at: '',
      },
    ];
    const result = aggregateSnapshots(snapshots);
    expect(result.ticketsCompleted).toBe(10);
    expect(result.ticketsCreated).toBe(5);
    expect(result.avgCycleTimeHours).toBe(24.5);
    expect(result.onTimeRate).toBe(85.5);
    expect(result.revisionRate).toBe(15);
    expect(result.aiPassRate).toBe(92);
  });
});

// ============================================================================
// buildUserScorecards
// ============================================================================

describe('buildUserScorecards', () => {
  it('returns empty array for empty map', () => {
    const result = buildUserScorecards(new Map(), new Map());
    expect(result).toEqual([]);
  });

  it('builds scorecards with correct metrics and trend', () => {
    const userSnapshots = new Map<string, ProductivitySnapshot[]>();
    userSnapshots.set('u1', [
      {
        id: '1', snapshot_date: '2025-06-01', user_id: 'u1', board_id: null, department: null,
        tickets_completed: 5, tickets_created: 3, avg_cycle_time_hours: 10,
        on_time_rate: 80, revision_rate: 20, ai_pass_rate: 90,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
      {
        id: '2', snapshot_date: '2025-06-02', user_id: 'u1', board_id: null, department: null,
        tickets_completed: 8, tickets_created: 4, avg_cycle_time_hours: 12,
        on_time_rate: 70, revision_rate: 30, ai_pass_rate: 85,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
    ]);

    const userNames = new Map<string, string>();
    userNames.set('u1', 'Alice');

    const result = buildUserScorecards(userSnapshots, userNames);
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('u1');
    expect(result[0].userName).toBe('Alice');
    expect(result[0].metrics.ticketsCompleted).toBe(13);
    expect(result[0].trend).toHaveLength(2);
    expect(result[0].trend[0]).toEqual({ date: '2025-06-01', completed: 5 });
    expect(result[0].trend[1]).toEqual({ date: '2025-06-02', completed: 8 });
    expect(result[0].rank).toBe(1);
  });

  it('ranks users by tickets completed descending', () => {
    const userSnapshots = new Map<string, ProductivitySnapshot[]>();
    userSnapshots.set('u1', [
      {
        id: '1', snapshot_date: '2025-06-01', user_id: 'u1', board_id: null, department: null,
        tickets_completed: 3, tickets_created: 2, avg_cycle_time_hours: null,
        on_time_rate: null, revision_rate: null, ai_pass_rate: null,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
    ]);
    userSnapshots.set('u2', [
      {
        id: '2', snapshot_date: '2025-06-01', user_id: 'u2', board_id: null, department: null,
        tickets_completed: 10, tickets_created: 5, avg_cycle_time_hours: null,
        on_time_rate: null, revision_rate: null, ai_pass_rate: null,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
    ]);
    userSnapshots.set('u3', [
      {
        id: '3', snapshot_date: '2025-06-01', user_id: 'u3', board_id: null, department: null,
        tickets_completed: 7, tickets_created: 4, avg_cycle_time_hours: null,
        on_time_rate: null, revision_rate: null, ai_pass_rate: null,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
    ]);

    const userNames = new Map<string, string>();
    userNames.set('u1', 'Alice');
    userNames.set('u2', 'Bob');
    userNames.set('u3', 'Charlie');

    const result = buildUserScorecards(userSnapshots, userNames);
    expect(result[0].userName).toBe('Bob');
    expect(result[0].rank).toBe(1);
    expect(result[1].userName).toBe('Charlie');
    expect(result[1].rank).toBe(2);
    expect(result[2].userName).toBe('Alice');
    expect(result[2].rank).toBe(3);
  });

  it('uses "Unknown" for missing user names', () => {
    const userSnapshots = new Map<string, ProductivitySnapshot[]>();
    userSnapshots.set('u1', [
      {
        id: '1', snapshot_date: '2025-06-01', user_id: 'u1', board_id: null, department: null,
        tickets_completed: 5, tickets_created: 3, avg_cycle_time_hours: null,
        on_time_rate: null, revision_rate: null, ai_pass_rate: null,
        total_time_logged_minutes: 0, metadata: {}, created_at: '',
      },
    ]);

    const result = buildUserScorecards(userSnapshots, new Map());
    expect(result[0].userName).toBe('Unknown');
  });
});

// ============================================================================
// calculateNextSendAt
// ============================================================================

describe('calculateNextSendAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns next day at 08:00 for daily schedule', () => {
    vi.setSystemTime(new Date('2025-06-15T10:00:00Z'));
    const result = calculateNextSendAt('daily');
    const date = new Date(result);
    expect(date.getDate()).toBe(16);
    expect(date.getHours()).toBe(8);
    expect(date.getMinutes()).toBe(0);
  });

  it('returns today at 08:00 for daily if before 8am', () => {
    // Use local time constructor to avoid timezone issues
    const earlyMorning = new Date(2025, 5, 15, 5, 0, 0, 0); // June 15, 5am local
    vi.setSystemTime(earlyMorning);
    const result = calculateNextSendAt('daily');
    const date = new Date(result);
    expect(date.getDate()).toBe(15);
    expect(date.getHours()).toBe(8);
  });

  it('calculates next weekly:monday correctly', () => {
    // June 15, 2025 is a Sunday
    vi.setSystemTime(new Date('2025-06-15T10:00:00Z'));
    const result = calculateNextSendAt('weekly:monday');
    const date = new Date(result);
    expect(date.getDay()).toBe(1); // Monday
    expect(date.getHours()).toBe(8);
  });

  it('calculates next weekly:friday correctly', () => {
    // June 16, 2025 is a Monday
    vi.setSystemTime(new Date('2025-06-16T10:00:00Z'));
    const result = calculateNextSendAt('weekly:friday');
    const date = new Date(result);
    expect(date.getDay()).toBe(5); // Friday
    expect(date.getHours()).toBe(8);
  });

  it('wraps to next week if the target day has passed', () => {
    // June 18, 2025 is a Wednesday
    vi.setSystemTime(new Date('2025-06-18T10:00:00Z'));
    const result = calculateNextSendAt('weekly:monday');
    const date = new Date(result);
    expect(date.getDay()).toBe(1); // Monday
    // Should be the next Monday (June 23)
    expect(date.getDate()).toBe(23);
  });

  it('calculates monthly:1 correctly when date has passed', () => {
    vi.setSystemTime(new Date('2025-06-15T10:00:00Z'));
    const result = calculateNextSendAt('monthly:1');
    const date = new Date(result);
    expect(date.getMonth()).toBe(6); // July (0-indexed)
    expect(date.getDate()).toBe(1);
    expect(date.getHours()).toBe(8);
  });

  it('calculates monthly:15 correctly when date is today but past 8am', () => {
    vi.setSystemTime(new Date('2025-06-15T10:00:00Z'));
    const result = calculateNextSendAt('monthly:15');
    const date = new Date(result);
    // 15th at 8am is before 10am on 15th, so it should go to next month
    expect(date.getMonth()).toBe(6); // July
    expect(date.getDate()).toBe(15);
  });

  it('returns an ISO string', () => {
    vi.setSystemTime(new Date('2025-06-15T10:00:00Z'));
    const result = calculateNextSendAt('daily');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

// ============================================================================
// Supabase-dependent functions (mock tests)
// ============================================================================

describe('logColumnMove', () => {
  it('calls supabase insert with correct params', async () => {
    const supabase = createMockSupabase();
    await logColumnMove(supabase as any, {
      cardId: 'c1',
      boardId: 'b1',
      toListId: 'l2',
      fromListId: 'l1',
      fromListName: 'To Do',
      toListName: 'In Progress',
      movedBy: 'u1',
    });
    expect(supabase.from).toHaveBeenCalledWith('card_column_history');
    expect(supabase._chain.insert).toHaveBeenCalledWith({
      card_id: 'c1',
      board_id: 'b1',
      from_list_id: 'l1',
      to_list_id: 'l2',
      from_list_name: 'To Do',
      to_list_name: 'In Progress',
      moved_by: 'u1',
    });
  });

  it('sets null for optional params when not provided', async () => {
    const supabase = createMockSupabase();
    await logColumnMove(supabase as any, {
      cardId: 'c1',
      boardId: 'b1',
      toListId: 'l2',
    });
    expect(supabase._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        from_list_id: null,
        from_list_name: null,
        to_list_name: null,
        moved_by: null,
      })
    );
  });
});

describe('getCardColumnHistory', () => {
  it('queries card_column_history with correct card_id', async () => {
    const supabase = createMockSupabase({
      order: vi.fn().mockResolvedValue({ data: [] }),
    });
    const result = await getCardColumnHistory(supabase as any, 'c1');
    expect(supabase.from).toHaveBeenCalledWith('card_column_history');
    expect(supabase._chain.eq).toHaveBeenCalledWith('card_id', 'c1');
    expect(result).toEqual([]);
  });

  it('returns data array from supabase', async () => {
    const mockData = [{ id: '1', card_id: 'c1' }];
    const supabase = createMockSupabase({
      order: vi.fn().mockResolvedValue({ data: mockData }),
    });
    const result = await getCardColumnHistory(supabase as any, 'c1');
    expect(result).toEqual(mockData);
  });
});

describe('getBoardColumnHistory', () => {
  it('queries with board_id and optional date range', async () => {
    const supabase = createMockSupabase({
      order: vi.fn().mockReturnThis(),
      lte: vi.fn().mockResolvedValue({ data: [] }),
    });
    await getBoardColumnHistory(supabase as any, 'b1', '2025-06-01', '2025-06-30');
    expect(supabase.from).toHaveBeenCalledWith('card_column_history');
    expect(supabase._chain.eq).toHaveBeenCalledWith('board_id', 'b1');
    expect(supabase._chain.gte).toHaveBeenCalledWith('moved_at', '2025-06-01');
    expect(supabase._chain.lte).toHaveBeenCalledWith('moved_at', '2025-06-30');
  });

  it('returns empty array when data is null', async () => {
    const supabase = createMockSupabase({
      order: vi.fn().mockResolvedValue({ data: null }),
    });
    const result = await getBoardColumnHistory(supabase as any, 'b1');
    expect(result).toEqual([]);
  });
});

describe('getProductivitySnapshots', () => {
  it('queries with date range and filters', async () => {
    const supabase = createMockSupabase();
    await getProductivitySnapshots(supabase as any, {
      startDate: '2025-06-01',
      endDate: '2025-06-30',
      userId: 'u1',
      boardId: 'b1',
      department: 'dev',
    });
    expect(supabase.from).toHaveBeenCalledWith('productivity_snapshots');
    expect(supabase._chain.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(supabase._chain.eq).toHaveBeenCalledWith('board_id', 'b1');
    expect(supabase._chain.eq).toHaveBeenCalledWith('department', 'dev');
  });
});

describe('createProductivitySnapshot', () => {
  it('upserts snapshot and returns result', async () => {
    const mockSnapshot = { id: 's1', snapshot_date: '2025-06-01', tickets_completed: 5 };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: mockSnapshot, error: null }),
    });
    const result = await createProductivitySnapshot(supabase as any, {
      snapshotDate: '2025-06-01',
      ticketsCompleted: 5,
      ticketsCreated: 3,
    });
    expect(result).toEqual(mockSnapshot);
  });

  it('returns null on error', async () => {
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    });
    const result = await createProductivitySnapshot(supabase as any, {
      snapshotDate: '2025-06-01',
      ticketsCompleted: 5,
      ticketsCreated: 3,
    });
    expect(result).toBeNull();
  });
});

describe('getScheduledReports', () => {
  it('queries scheduled_reports table', async () => {
    const supabase = createMockSupabase({
      order: vi.fn().mockResolvedValue({ data: [] }),
    });
    const result = await getScheduledReports(supabase as any);
    expect(supabase.from).toHaveBeenCalledWith('scheduled_reports');
    expect(result).toEqual([]);
  });
});

describe('createScheduledReport', () => {
  it('creates report and returns result', async () => {
    const mockReport = { id: 'r1', name: 'Test Report' };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: mockReport, error: null }),
    });
    const result = await createScheduledReport(supabase as any, {
      name: 'Test Report',
      reportType: 'productivity',
      schedule: 'daily',
      recipients: ['a@b.com'],
      createdBy: 'u1',
    });
    expect(result).toEqual(mockReport);
  });
});

describe('deleteScheduledReport', () => {
  it('calls delete on supabase', async () => {
    const supabase = createMockSupabase({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    await deleteScheduledReport(supabase as any, 'r1');
    expect(supabase.from).toHaveBeenCalledWith('scheduled_reports');
  });
});
