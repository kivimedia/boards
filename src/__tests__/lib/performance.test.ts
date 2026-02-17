import { describe, it, expect, vi } from 'vitest';
import {
  checkPerformanceRegression,
  PERFORMANCE_THRESHOLDS,
  paginateCards,
  paginateTable,
  loadBoardWithAllData,
} from '@/lib/performance';
import type { PerformanceMetric } from '@/lib/performance';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chainable: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
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
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function createMetric(overrides: Partial<PerformanceMetric> = {}): PerformanceMetric {
  return {
    name: 'page_load_ms',
    value: 1500,
    unit: 'ms',
    threshold: 2000,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Performance Optimization (P5.3)', () => {
  // --------------------------------------------------------------------------
  // checkPerformanceRegression
  // --------------------------------------------------------------------------

  describe('checkPerformanceRegression', () => {
    it('reports no regression when values are the same', () => {
      const baseline = [createMetric({ name: 'page_load_ms', value: 1000 })];
      const current = [createMetric({ name: 'page_load_ms', value: 1000 })];
      const result = checkPerformanceRegression(baseline, current);
      expect(result.passed).toBe(true);
      expect(result.regressions).toHaveLength(0);
    });

    it('detects latency increase greater than 10%', () => {
      const baseline = [createMetric({ name: 'api_p95_ms', value: 100 })];
      const current = [createMetric({ name: 'api_p95_ms', value: 120 })];
      const result = checkPerformanceRegression(baseline, current);
      expect(result.passed).toBe(false);
      expect(result.regressions).toHaveLength(1);
      expect(result.regressions[0]).toContain('api_p95_ms');
    });

    it('detects FPS decrease greater than 10%', () => {
      const baseline = [createMetric({ name: 'card_drag_fps', value: 60, unit: 'fps' })];
      const current = [createMetric({ name: 'card_drag_fps', value: 50, unit: 'fps' })];
      const result = checkPerformanceRegression(baseline, current);
      expect(result.passed).toBe(false);
      expect(result.regressions).toHaveLength(1);
      expect(result.regressions[0]).toContain('card_drag_fps');
    });

    it('ignores metrics with 0 baseline value', () => {
      const baseline = [createMetric({ name: 'page_load_ms', value: 0 })];
      const current = [createMetric({ name: 'page_load_ms', value: 5000 })];
      const result = checkPerformanceRegression(baseline, current);
      expect(result.passed).toBe(true);
      expect(result.regressions).toHaveLength(0);
    });

    it('handles empty arrays gracefully', () => {
      const result = checkPerformanceRegression([], []);
      expect(result.passed).toBe(true);
      expect(result.regressions).toHaveLength(0);
    });

    it('detects multiple regressions', () => {
      const baseline = [
        createMetric({ name: 'page_load_ms', value: 100 }),
        createMetric({ name: 'api_p95_ms', value: 200 }),
      ];
      const current = [
        createMetric({ name: 'page_load_ms', value: 200 }),
        createMetric({ name: 'api_p95_ms', value: 400 }),
      ];
      const result = checkPerformanceRegression(baseline, current);
      expect(result.passed).toBe(false);
      expect(result.regressions).toHaveLength(2);
    });

    it('passes when latency is exactly at threshold (10% degradation)', () => {
      const baseline = [createMetric({ name: 'page_load_ms', value: 100 })];
      const current = [createMetric({ name: 'page_load_ms', value: 110 })];
      const result = checkPerformanceRegression(baseline, current);
      expect(result.passed).toBe(true);
    });

    it('supports custom threshold percentage', () => {
      const baseline = [createMetric({ name: 'page_load_ms', value: 100 })];
      const current = [createMetric({ name: 'page_load_ms', value: 106 })];
      // With 5% max degradation, 106 is over
      const result = checkPerformanceRegression(baseline, current, 5);
      expect(result.passed).toBe(false);
      expect(result.regressions).toHaveLength(1);
    });

    it('ignores current metrics not found in baseline', () => {
      const baseline = [createMetric({ name: 'page_load_ms', value: 100 })];
      const current = [createMetric({ name: 'unknown_metric', value: 9999 })];
      const result = checkPerformanceRegression(baseline, current);
      expect(result.passed).toBe(true);
    });

    it('passes when FPS is exactly at threshold', () => {
      const baseline = [createMetric({ name: 'card_drag_fps', value: 60, unit: 'fps' })];
      // 10% degradation of 60 fps is 54 fps; 54 is the boundary
      const current = [createMetric({ name: 'card_drag_fps', value: 54, unit: 'fps' })];
      const result = checkPerformanceRegression(baseline, current);
      expect(result.passed).toBe(true);
    });

    it('regression message includes metric name and values', () => {
      const baseline = [createMetric({ name: 'board_load_ms', value: 100 })];
      const current = [createMetric({ name: 'board_load_ms', value: 200 })];
      const result = checkPerformanceRegression(baseline, current);
      expect(result.regressions[0]).toContain('board_load_ms');
      expect(result.regressions[0]).toContain('100');
      expect(result.regressions[0]).toContain('200');
    });

    it('works with 0% max degradation threshold', () => {
      const baseline = [createMetric({ name: 'page_load_ms', value: 100 })];
      const current = [createMetric({ name: 'page_load_ms', value: 101 })];
      const result = checkPerformanceRegression(baseline, current, 0);
      expect(result.passed).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // PERFORMANCE_THRESHOLDS
  // --------------------------------------------------------------------------

  describe('PERFORMANCE_THRESHOLDS', () => {
    it('has all expected metrics', () => {
      const metricNames = PERFORMANCE_THRESHOLDS.map((m) => m.name);
      expect(metricNames).toContain('page_load_ms');
      expect(metricNames).toContain('board_load_ms');
      expect(metricNames).toContain('card_drag_fps');
      expect(metricNames).toContain('realtime_latency_ms');
      expect(metricNames).toContain('api_p95_ms');
    });

    it('has 5 threshold entries', () => {
      expect(PERFORMANCE_THRESHOLDS).toHaveLength(5);
    });

    it('all thresholds are positive numbers', () => {
      for (const metric of PERFORMANCE_THRESHOLDS) {
        expect(metric.threshold).toBeGreaterThan(0);
      }
    });

    it('all metrics have a unit', () => {
      for (const metric of PERFORMANCE_THRESHOLDS) {
        expect(metric.unit).toBeDefined();
        expect(typeof metric.unit).toBe('string');
        expect(metric.unit.length).toBeGreaterThan(0);
      }
    });

    it('all initial values are 0', () => {
      for (const metric of PERFORMANCE_THRESHOLDS) {
        expect(metric.value).toBe(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // paginateCards (mock)
  // --------------------------------------------------------------------------

  describe('paginateCards', () => {
    it('returns items with has_more=false when fewer than limit', async () => {
      const rows = [
        { id: '1', position: 0, card_id: 'c1', cards: { id: 'c1', created_at: '2025-01-01' } },
        { id: '2', position: 1, card_id: 'c2', cards: { id: 'c2', created_at: '2025-01-02' } },
      ];
      const mock = createMockSupabase();
      // Override the terminal: after .limit() is called, resolve with data
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: rows, error: null });

      const result = await paginateCards(mock as never, 'board-1', undefined, { limit: 50, direction: 'forward' });
      expect(result.has_more).toBe(false);
      expect(result.items).toHaveLength(2);
      expect(result.next_cursor).toBeNull();
    });

    it('returns has_more=true and next_cursor when more rows available', async () => {
      // Simulate limit+1 rows returned (3 rows for limit=2)
      const rows = [
        { id: '1', position: 0, card_id: 'c1', cards: { id: 'c1', created_at: '2025-01-01' } },
        { id: '2', position: 1, card_id: 'c2', cards: { id: 'c2', created_at: '2025-01-02' } },
        { id: '3', position: 2, card_id: 'c3', cards: { id: 'c3', created_at: '2025-01-03' } },
      ];
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: rows, error: null });

      const result = await paginateCards(mock as never, 'board-1', undefined, { limit: 2, direction: 'forward' });
      expect(result.has_more).toBe(true);
      expect(result.items).toHaveLength(2);
      expect(result.next_cursor).toBe('2025-01-02');
    });

    it('applies list_id filter when provided', async () => {
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: [], error: null });

      await paginateCards(mock as never, 'board-1', 'list-1', { limit: 50, direction: 'forward' });
      // eq should be called for board_id and list_id
      expect(mock._chain.eq).toHaveBeenCalledWith('board_id', 'board-1');
      expect(mock._chain.eq).toHaveBeenCalledWith('list_id', 'list-1');
    });

    it('applies cursor with forward direction', async () => {
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: [], error: null });

      await paginateCards(mock as never, 'board-1', undefined, {
        cursor: '2025-01-15',
        limit: 50,
        direction: 'forward',
      });
      expect(mock._chain.gt).toHaveBeenCalledWith('cards.created_at', '2025-01-15');
    });

    it('applies cursor with backward direction', async () => {
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: [], error: null });

      await paginateCards(mock as never, 'board-1', undefined, {
        cursor: '2025-01-15',
        limit: 50,
        direction: 'backward',
      });
      expect(mock._chain.lt).toHaveBeenCalledWith('cards.created_at', '2025-01-15');
    });

    it('returns empty result when no data', async () => {
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: null, error: null });

      const result = await paginateCards(mock as never, 'board-1');
      expect(result.items).toHaveLength(0);
      expect(result.has_more).toBe(false);
      expect(result.next_cursor).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // paginateTable (mock)
  // --------------------------------------------------------------------------

  describe('paginateTable', () => {
    it('uses correct cursor column', async () => {
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: [], error: null });

      await paginateTable(mock as never, 'cards', {
        cursor: '2025-01-01',
        cursorColumn: 'updated_at',
        direction: 'forward',
      });
      expect(mock._chain.lt).toHaveBeenCalledWith('updated_at', '2025-01-01');
    });

    it('applies filters', async () => {
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: [], error: null });

      await paginateTable(mock as never, 'cards', {
        filters: { board_id: 'board-1', status: 'active' },
      });
      expect(mock._chain.eq).toHaveBeenCalledWith('board_id', 'board-1');
      expect(mock._chain.eq).toHaveBeenCalledWith('status', 'active');
    });

    it('respects limit cap at 200', async () => {
      const mock = createMockSupabase();
      const limitFn = vi.fn().mockResolvedValue({ data: [], error: null });
      (mock._chain as Record<string, unknown>)['limit'] = limitFn;

      await paginateTable(mock as never, 'cards', { limit: 500 });
      // Should be capped to 200 + 1 = 201
      expect(limitFn).toHaveBeenCalledWith(201);
    });

    it('handles backward direction', async () => {
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: [], error: null });

      await paginateTable(mock as never, 'cards', {
        cursor: '2025-06-01',
        direction: 'backward',
      });
      // Default ascending is false, backward + descending = gt
      expect(mock._chain.gt).toHaveBeenCalledWith('created_at', '2025-06-01');
    });

    it('returns has_more when more rows than limit', async () => {
      const rows = [{ id: '1', created_at: 'a' }, { id: '2', created_at: 'b' }, { id: '3', created_at: 'c' }];
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: rows, error: null });

      const result = await paginateTable(mock as never, 'cards', { limit: 2 });
      expect(result.has_more).toBe(true);
      expect(result.items).toHaveLength(2);
    });

    it('defaults limit to 50', async () => {
      const mock = createMockSupabase();
      const limitFn = vi.fn().mockResolvedValue({ data: [], error: null });
      (mock._chain as Record<string, unknown>)['limit'] = limitFn;

      await paginateTable(mock as never, 'cards', {});
      expect(limitFn).toHaveBeenCalledWith(51);
    });

    it('queries the correct table', async () => {
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: [], error: null });

      await paginateTable(mock as never, 'activity_logs', {});
      expect(mock.from).toHaveBeenCalledWith('activity_logs');
    });
  });

  // --------------------------------------------------------------------------
  // loadBoardWithAllData (mock)
  // --------------------------------------------------------------------------

  describe('loadBoardWithAllData', () => {
    it('returns all data sections', async () => {
      const boardData = { id: 'board-1', name: 'Test Board' };
      const listsData = [{ id: 'list-1', name: 'To Do' }];

      // Build a more complex mock since loadBoardWithAllData uses Promise.all
      const singleMock = vi.fn().mockResolvedValue({ data: boardData, error: null });
      const listMock = vi.fn().mockResolvedValue({ data: listsData, error: null });
      const placementMock = vi.fn().mockResolvedValue({ data: [], error: null });
      const labelsMock = vi.fn().mockResolvedValue({ data: [], error: null });
      const cardLabelsMock = vi.fn().mockResolvedValue({ data: [], error: null });
      const assigneesMock = vi.fn().mockResolvedValue({ data: [], error: null });

      let callCount = 0;
      const fromMock = vi.fn().mockImplementation(() => {
        callCount++;
        const chain: Record<string, unknown> = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
        };
        if (callCount === 1) chain.single = singleMock;
        else if (callCount === 2) Object.assign(chain, { order: vi.fn().mockImplementation(() => listMock()) });
        else if (callCount === 3) Object.assign(chain, { order: vi.fn().mockImplementation(() => placementMock()) });
        else if (callCount === 4) return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(labelsMock()) }) };
        else if (callCount === 5) return { select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(cardLabelsMock()) }) };
        else return { select: vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue(assigneesMock()) }) };
        return chain;
      });

      const mock = { from: fromMock };
      const result = await loadBoardWithAllData(mock as never, 'board-1');

      expect(result).toHaveProperty('board');
      expect(result).toHaveProperty('lists');
      expect(result).toHaveProperty('placements');
      expect(result).toHaveProperty('labels');
      expect(result).toHaveProperty('cardLabels');
      expect(result).toHaveProperty('assignees');
    });

    it('handles empty board (board not found)', async () => {
      const chain: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      // Make every from call return the same chain for simplicity
      const mock = {
        from: vi.fn(() => ({
          ...chain,
          select: vi.fn().mockReturnValue({
            ...chain,
            eq: vi.fn().mockReturnValue({
              ...chain,
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        })),
      };

      const result = await loadBoardWithAllData(mock as never, 'nonexistent');
      expect(result.board).toBeNull();
    });
  });
});
