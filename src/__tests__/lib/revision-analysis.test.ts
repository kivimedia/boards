import { describe, it, expect, vi } from 'vitest';
import {
  detectPingPong,
  calculateRevisionTime,
  detectOutliers,
  OUTLIER_MULTIPLIER,
  formatRevisionMetricsCSV,
  computeBoardRevisionMetrics,
  storeRevisionMetrics,
  getRevisionMetrics,
  getCardRevisionMetrics,
  createRevisionExport,
  getRevisionExports,
  updateRevisionExport,
} from '../../lib/revision-analysis';
import type { CardColumnHistory, RevisionMetrics } from '@/lib/types';

// ============================================================================
// HELPERS
// ============================================================================

function makeHistory(moves: { from?: string; to: string; movedAt: string }[]): CardColumnHistory[] {
  return moves.map((m, i) => ({
    id: `h${i}`,
    card_id: 'card-1',
    board_id: 'board-1',
    from_list_id: null,
    to_list_id: `list-${i}`,
    from_list_name: m.from ?? null,
    to_list_name: m.to,
    moved_by: null,
    moved_at: m.movedAt,
  }));
}

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chainable: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
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
// OUTLIER_MULTIPLIER CONSTANT
// ============================================================================

describe('OUTLIER_MULTIPLIER', () => {
  it('equals 1.5', () => {
    expect(OUTLIER_MULTIPLIER).toBe(1.5);
  });
});

// ============================================================================
// detectPingPong
// ============================================================================

describe('detectPingPong', () => {
  it('returns 0 for empty history', () => {
    expect(detectPingPong([])).toBe(0);
  });

  it('returns 0 when there are no revision columns in history', () => {
    const history = makeHistory([
      { to: 'To Do', movedAt: '2025-01-01T00:00:00Z' },
      { from: 'To Do', to: 'In Progress', movedAt: '2025-01-02T00:00:00Z' },
      { from: 'In Progress', to: 'Done', movedAt: '2025-01-03T00:00:00Z' },
    ]);
    expect(detectPingPong(history)).toBe(0);
  });

  it('returns 0 when card goes to revision without coming from a work column', () => {
    const history = makeHistory([
      { to: 'To Do', movedAt: '2025-01-01T00:00:00Z' },
      { from: 'To Do', to: 'Revisions', movedAt: '2025-01-02T00:00:00Z' },
    ]);
    expect(detectPingPong(history)).toBe(0);
  });

  it('returns 1 for a single work -> revision cycle', () => {
    const history = makeHistory([
      { to: 'In Progress', movedAt: '2025-01-01T00:00:00Z' },
      { from: 'In Progress', to: 'Revisions', movedAt: '2025-01-02T00:00:00Z' },
    ]);
    expect(detectPingPong(history)).toBe(1);
  });

  it('returns 2 for two back-and-forth cycles', () => {
    const history = makeHistory([
      { to: 'In Progress', movedAt: '2025-01-01T00:00:00Z' },
      { from: 'In Progress', to: 'Revisions', movedAt: '2025-01-02T00:00:00Z' },
      { from: 'Revisions', to: 'In Progress', movedAt: '2025-01-03T00:00:00Z' },
      { from: 'In Progress', to: 'Revisions', movedAt: '2025-01-04T00:00:00Z' },
    ]);
    expect(detectPingPong(history)).toBe(2);
  });

  it('counts ping-pong with "Changes Requested" column', () => {
    const history = makeHistory([
      { to: 'Working', movedAt: '2025-01-01T00:00:00Z' },
      { from: 'Working', to: 'Changes Requested', movedAt: '2025-01-02T00:00:00Z' },
    ]);
    expect(detectPingPong(history)).toBe(1);
  });

  it('uses case-insensitive matching for column names', () => {
    const history = makeHistory([
      { to: 'in progress', movedAt: '2025-01-01T00:00:00Z' },
      { from: 'in progress', to: 'REVISIONS', movedAt: '2025-01-02T00:00:00Z' },
    ]);
    expect(detectPingPong(history)).toBe(1);
  });

  it('handles custom revision and work columns', () => {
    const history = makeHistory([
      { to: 'Dev Queue', movedAt: '2025-01-01T00:00:00Z' },
      { from: 'Dev Queue', to: 'Needs Fix', movedAt: '2025-01-02T00:00:00Z' },
    ]);
    expect(detectPingPong(history, ['Needs Fix'], ['Dev Queue'])).toBe(1);
  });

  it('handles multiple transitions with unrelated columns interleaved', () => {
    const history = makeHistory([
      { to: 'In Progress', movedAt: '2025-01-01T00:00:00Z' },
      { from: 'In Progress', to: 'QA', movedAt: '2025-01-02T00:00:00Z' },
      { from: 'QA', to: 'Revisions', movedAt: '2025-01-03T00:00:00Z' },
    ]);
    // No direct work -> revision transition after QA breaks the chain
    expect(detectPingPong(history)).toBe(0);
  });

  it('counts three consecutive ping-pongs correctly', () => {
    const history = makeHistory([
      { to: 'In Progress', movedAt: '2025-01-01T00:00:00Z' },
      { from: 'In Progress', to: 'Revision', movedAt: '2025-01-02T00:00:00Z' },
      { from: 'Revision', to: 'Designing', movedAt: '2025-01-03T00:00:00Z' },
      { from: 'Designing', to: 'Client Revisions', movedAt: '2025-01-04T00:00:00Z' },
      { from: 'Client Revisions', to: 'Working', movedAt: '2025-01-05T00:00:00Z' },
      { from: 'Working', to: 'Revisions', movedAt: '2025-01-06T00:00:00Z' },
    ]);
    expect(detectPingPong(history)).toBe(3);
  });

  it('handles history with null to_list_name entries', () => {
    const history: CardColumnHistory[] = [
      {
        id: 'h1', card_id: 'c1', board_id: 'b1',
        from_list_id: null, to_list_id: 'l1',
        from_list_name: null, to_list_name: null,
        moved_by: null, moved_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'h2', card_id: 'c1', board_id: 'b1',
        from_list_id: null, to_list_id: 'l2',
        from_list_name: null, to_list_name: 'In Progress',
        moved_by: null, moved_at: '2025-01-02T00:00:00Z',
      },
    ];
    expect(detectPingPong(history)).toBe(0);
  });
});

// ============================================================================
// calculateRevisionTime
// ============================================================================

describe('calculateRevisionTime', () => {
  it('returns 0 for empty history', () => {
    expect(calculateRevisionTime([])).toBe(0);
  });

  it('returns 0 when no revision columns are visited', () => {
    const history = makeHistory([
      { to: 'In Progress', movedAt: '2025-01-01T09:00:00Z' },
      { from: 'In Progress', to: 'Done', movedAt: '2025-01-01T17:00:00Z' },
    ]);
    expect(calculateRevisionTime(history)).toBe(0);
  });

  it('calculates time for a single revision stint', () => {
    const history = makeHistory([
      { to: 'Revisions', movedAt: '2025-01-01T09:00:00Z' },
      { from: 'Revisions', to: 'In Progress', movedAt: '2025-01-01T11:00:00Z' },
    ]);
    expect(calculateRevisionTime(history)).toBe(120); // 2 hours
  });

  it('sums time across multiple revision stints', () => {
    const history = makeHistory([
      { to: 'Revisions', movedAt: '2025-01-01T09:00:00Z' },
      { from: 'Revisions', to: 'In Progress', movedAt: '2025-01-01T10:00:00Z' }, // 60 min
      { from: 'In Progress', to: 'Revisions', movedAt: '2025-01-02T09:00:00Z' },
      { from: 'Revisions', to: 'Done', movedAt: '2025-01-02T09:30:00Z' }, // 30 min
    ]);
    expect(calculateRevisionTime(history)).toBe(90);
  });

  it('works with "Changes Requested" column name', () => {
    const history = makeHistory([
      { to: 'Changes Requested', movedAt: '2025-01-01T09:00:00Z' },
      { from: 'Changes Requested', to: 'In Progress', movedAt: '2025-01-01T09:45:00Z' },
    ]);
    expect(calculateRevisionTime(history)).toBe(45);
  });

  it('supports custom revision column names', () => {
    const history = makeHistory([
      { to: 'My Custom Rev', movedAt: '2025-01-01T10:00:00Z' },
      { from: 'My Custom Rev', to: 'Done', movedAt: '2025-01-01T10:15:00Z' },
    ]);
    expect(calculateRevisionTime(history, ['My Custom Rev'])).toBe(15);
  });

  it('handles transition that stays in revision (no exit)', () => {
    // Card enters revision but never leaves (no subsequent move) -> not counted since loop doesn't close
    const history = makeHistory([
      { to: 'Revisions', movedAt: '2025-01-01T09:00:00Z' },
    ]);
    expect(calculateRevisionTime(history)).toBe(0);
  });
});

// ============================================================================
// detectOutliers
// ============================================================================

describe('detectOutliers', () => {
  it('returns empty array for empty input', () => {
    expect(detectOutliers([])).toEqual([]);
  });

  it('marks no outliers when all cards have the same ping-pong count', () => {
    const cards = [
      { cardId: 'c1', pingPongCount: 3 },
      { cardId: 'c2', pingPongCount: 3 },
      { cardId: 'c3', pingPongCount: 3 },
    ];
    const result = detectOutliers(cards);
    expect(result.every((r) => !r.isOutlier)).toBe(true);
  });

  it('marks a card as outlier when its count exceeds 1.5x average', () => {
    // avg = (1 + 1 + 1 + 10) / 4 = 3.25, threshold = 4.875
    const cards = [
      { cardId: 'c1', pingPongCount: 1 },
      { cardId: 'c2', pingPongCount: 1 },
      { cardId: 'c3', pingPongCount: 1 },
      { cardId: 'c4', pingPongCount: 10 },
    ];
    const result = detectOutliers(cards);
    expect(result.find((r) => r.cardId === 'c4')?.isOutlier).toBe(true);
    expect(result.find((r) => r.cardId === 'c1')?.isOutlier).toBe(false);
  });

  it('includes a reason string for outlier cards', () => {
    const cards = [
      { cardId: 'c1', pingPongCount: 1 },
      { cardId: 'c2', pingPongCount: 100 },
    ];
    const result = detectOutliers(cards);
    const outlier = result.find((r) => r.cardId === 'c2');
    expect(outlier?.isOutlier).toBe(true);
    expect(outlier?.reason).toContain('exceeds threshold');
    expect(outlier?.reason).toContain('100');
  });

  it('returns undefined reason for non-outlier cards', () => {
    const cards = [
      { cardId: 'c1', pingPongCount: 2 },
      { cardId: 'c2', pingPongCount: 2 },
    ];
    const result = detectOutliers(cards);
    expect(result[0].reason).toBeUndefined();
    expect(result[1].reason).toBeUndefined();
  });

  it('handles a single card (never an outlier since count cannot exceed 1.5x of itself)', () => {
    // avg = 5, threshold = 7.5, 5 is not > 7.5
    const cards = [{ cardId: 'c1', pingPongCount: 5 }];
    const result = detectOutliers(cards);
    expect(result[0].isOutlier).toBe(false);
  });

  it('handles cards with zero ping-pong count', () => {
    // avg = 0, threshold = 0, 0 is not > 0
    const cards = [
      { cardId: 'c1', pingPongCount: 0 },
      { cardId: 'c2', pingPongCount: 0 },
    ];
    const result = detectOutliers(cards);
    expect(result.every((r) => !r.isOutlier)).toBe(true);
  });

  it('uses strict greater-than comparison (exact 1.5x not an outlier)', () => {
    // avg = (2 + 4) / 2 = 3, threshold = 4.5, 4 is not > 4.5
    const cards = [
      { cardId: 'c1', pingPongCount: 2 },
      { cardId: 'c2', pingPongCount: 4 },
    ];
    const result = detectOutliers(cards);
    expect(result.find((r) => r.cardId === 'c2')?.isOutlier).toBe(false);
  });

  it('threshold math: avg=2, threshold=3, count=4 is outlier', () => {
    // avg = (1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 4) / 12 = 15/12 = 1.25
    // threshold = 1.875, 4 > 1.875 = true
    const cards = Array.from({ length: 11 }, (_, i) => ({
      cardId: `c${i}`,
      pingPongCount: 1,
    }));
    cards.push({ cardId: 'outlier', pingPongCount: 4 });
    const result = detectOutliers(cards);
    expect(result.find((r) => r.cardId === 'outlier')?.isOutlier).toBe(true);
  });
});

// ============================================================================
// formatRevisionMetricsCSV
// ============================================================================

describe('formatRevisionMetricsCSV', () => {
  it('returns header row for empty metrics', () => {
    const csv = formatRevisionMetricsCSV([]);
    expect(csv).toBe('Card ID,Board ID,Ping-Pong Count,Revision Time (min),Is Outlier,First Revision,Last Revision');
  });

  it('formats a single metric row correctly', () => {
    const metrics: RevisionMetrics[] = [{
      id: 'm1',
      card_id: 'card-abc',
      board_id: 'board-xyz',
      ping_pong_count: 3,
      total_revision_time_minutes: 120,
      first_revision_at: '2025-01-01T09:00:00Z',
      last_revision_at: '2025-01-05T14:00:00Z',
      is_outlier: true,
      outlier_reason: 'Exceeds threshold',
      avg_board_ping_pong: 1.5,
      computed_at: '2025-01-06T00:00:00Z',
    }];
    const csv = formatRevisionMetricsCSV(metrics);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('card-abc');
    expect(lines[1]).toContain('board-xyz');
    expect(lines[1]).toContain('3');
    expect(lines[1]).toContain('120');
    expect(lines[1]).toContain('true');
  });

  it('handles null first/last revision dates as empty strings', () => {
    const metrics: RevisionMetrics[] = [{
      id: 'm2',
      card_id: 'c1',
      board_id: 'b1',
      ping_pong_count: 0,
      total_revision_time_minutes: 0,
      first_revision_at: null,
      last_revision_at: null,
      is_outlier: false,
      outlier_reason: null,
      avg_board_ping_pong: null,
      computed_at: '2025-01-01T00:00:00Z',
    }];
    const csv = formatRevisionMetricsCSV(metrics);
    const lines = csv.split('\n');
    // Last two fields should be empty
    expect(lines[1]).toMatch(/,,$/);
  });

  it('formats multiple rows', () => {
    const metrics: RevisionMetrics[] = [
      {
        id: 'm1', card_id: 'c1', board_id: 'b1', ping_pong_count: 1,
        total_revision_time_minutes: 30, first_revision_at: '2025-01-01T09:00:00Z',
        last_revision_at: '2025-01-01T09:30:00Z', is_outlier: false,
        outlier_reason: null, avg_board_ping_pong: 1.5, computed_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'm2', card_id: 'c2', board_id: 'b1', ping_pong_count: 5,
        total_revision_time_minutes: 300, first_revision_at: '2025-01-02T09:00:00Z',
        last_revision_at: '2025-01-05T09:00:00Z', is_outlier: true,
        outlier_reason: 'high', avg_board_ping_pong: 1.5, computed_at: '2025-01-01T00:00:00Z',
      },
    ];
    const csv = formatRevisionMetricsCSV(metrics);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
    expect(lines[1]).toContain('c1');
    expect(lines[2]).toContain('c2');
  });
});

// ============================================================================
// computeBoardRevisionMetrics (with mock Supabase)
// ============================================================================

describe('computeBoardRevisionMetrics', () => {
  it('returns zero metrics for board with no history', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: [] });

    const result = await computeBoardRevisionMetrics(supabase as any, 'board-1');
    expect(result.boardId).toBe('board-1');
    expect(result.totalCards).toBe(0);
    expect(result.avgPingPongCount).toBe(0);
    expect(result.outlierCount).toBe(0);
    expect(result.cards).toHaveLength(0);
  });

  it('computes metrics for a board with history entries', async () => {
    const historyData: CardColumnHistory[] = [
      {
        id: 'h1', card_id: 'c1', board_id: 'b1',
        from_list_id: null, to_list_id: 'l1',
        from_list_name: null, to_list_name: 'In Progress',
        moved_by: null, moved_at: '2025-01-01T09:00:00Z',
      },
      {
        id: 'h2', card_id: 'c1', board_id: 'b1',
        from_list_id: 'l1', to_list_id: 'l2',
        from_list_name: 'In Progress', to_list_name: 'Revisions',
        moved_by: null, moved_at: '2025-01-01T11:00:00Z',
      },
      {
        id: 'h3', card_id: 'c1', board_id: 'b1',
        from_list_id: 'l2', to_list_id: 'l1',
        from_list_name: 'Revisions', to_list_name: 'In Progress',
        moved_by: null, moved_at: '2025-01-01T13:00:00Z',
      },
    ];

    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: historyData });

    const result = await computeBoardRevisionMetrics(supabase as any, 'b1');
    expect(result.totalCards).toBe(1);
    expect(result.cards[0].ping_pong_count).toBe(1);
    expect(result.cards[0].total_revision_time_minutes).toBe(120);
  });
});

// ============================================================================
// storeRevisionMetrics (mock)
// ============================================================================

describe('storeRevisionMetrics', () => {
  it('calls insert on supabase for non-empty metrics', async () => {
    const supabase = createMockSupabase();
    const metrics: RevisionMetrics[] = [{
      id: '', card_id: 'c1', board_id: 'b1', ping_pong_count: 2,
      total_revision_time_minutes: 60, first_revision_at: null, last_revision_at: null,
      is_outlier: false, outlier_reason: null, avg_board_ping_pong: 2,
      computed_at: new Date().toISOString(),
    }];

    await storeRevisionMetrics(supabase as any, metrics);
    expect(supabase.from).toHaveBeenCalledWith('revision_metrics');
  });

  it('does nothing for empty metrics array', async () => {
    const supabase = createMockSupabase();
    await storeRevisionMetrics(supabase as any, []);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

// ============================================================================
// getRevisionMetrics (mock)
// ============================================================================

describe('getRevisionMetrics', () => {
  it('returns metrics array from supabase', async () => {
    const mockData = [{ id: 'm1', card_id: 'c1', board_id: 'b1', ping_pong_count: 3 }];
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: mockData });

    const result = await getRevisionMetrics(supabase as any, 'b1');
    expect(result).toEqual(mockData);
  });

  it('returns empty array on null data', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: null });

    const result = await getRevisionMetrics(supabase as any, 'b1');
    expect(result).toEqual([]);
  });

  it('passes outliers_only filter to supabase', async () => {
    const supabase = createMockSupabase();

    await getRevisionMetrics(supabase as any, 'b1', true);
    // eq should have been called with is_outlier, true
    expect(supabase._chain.eq).toHaveBeenCalledWith('is_outlier', true);
  });
});

// ============================================================================
// getCardRevisionMetrics (mock)
// ============================================================================

describe('getCardRevisionMetrics', () => {
  it('returns single metric for a card', async () => {
    const mockMetric = { id: 'm1', card_id: 'c1', ping_pong_count: 2 };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: mockMetric, error: null }),
    });

    const result = await getCardRevisionMetrics(supabase as any, 'c1');
    expect(result).toEqual(mockMetric);
  });

  it('returns null when no metric found', async () => {
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const result = await getCardRevisionMetrics(supabase as any, 'nonexistent');
    expect(result).toBeNull();
  });
});
