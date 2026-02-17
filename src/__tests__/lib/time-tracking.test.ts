import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatTimeEntriesForCSV,
  startTimer,
  stopTimer,
  stopRunningTimer,
  getRunningTimer,
  createManualEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getCardTimeEntries,
  getUserTimeEntries,
  getTimeReport,
  getCardTotalTime,
  getEstimateVsActual,
  getTimeReportSnapshots,
} from '../../lib/time-tracking';
import type { TimeEntry } from '@/lib/types';

// ============================================================================
// Mock Supabase
// ============================================================================

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
// formatTimeEntriesForCSV
// ============================================================================

describe('formatTimeEntriesForCSV', () => {
  it('returns header row when entries array is empty', () => {
    const csv = formatTimeEntriesForCSV([]);
    expect(csv).toBe('Date,Description,Duration (hrs),Billable,Card ID,Board ID,Client ID');
  });

  it('formats a single entry correctly', () => {
    const entry: TimeEntry = {
      id: 'e1',
      card_id: 'c1',
      user_id: 'u1',
      board_id: 'b1',
      client_id: 'cl1',
      description: 'Working on feature',
      started_at: '2025-06-01T09:00:00Z',
      ended_at: '2025-06-01T10:30:00Z',
      duration_minutes: 90,
      is_billable: true,
      is_running: false,
      created_at: '2025-06-01T09:00:00Z',
      updated_at: '2025-06-01T10:30:00Z',
    };
    const csv = formatTimeEntriesForCSV([entry]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('2025-06-01');
    expect(lines[1]).toContain('Working on feature');
    expect(lines[1]).toContain('1.50');
    expect(lines[1]).toContain('true');
    expect(lines[1]).toContain('c1');
    expect(lines[1]).toContain('b1');
    expect(lines[1]).toContain('cl1');
  });

  it('replaces commas in description with semicolons', () => {
    const entry: TimeEntry = {
      id: 'e2',
      card_id: 'c1',
      user_id: 'u1',
      board_id: null,
      client_id: null,
      description: 'Fix bug, refactor code, add tests',
      started_at: '2025-06-01T09:00:00Z',
      ended_at: '2025-06-01T10:00:00Z',
      duration_minutes: 60,
      is_billable: false,
      is_running: false,
      created_at: '2025-06-01T09:00:00Z',
      updated_at: '2025-06-01T10:00:00Z',
    };
    const csv = formatTimeEntriesForCSV([entry]);
    expect(csv).toContain('Fix bug; refactor code; add tests');
    expect(csv).not.toContain('Fix bug, refactor code');
  });

  it('handles null description', () => {
    const entry: TimeEntry = {
      id: 'e3',
      card_id: 'c1',
      user_id: 'u1',
      board_id: null,
      client_id: null,
      description: null,
      started_at: '2025-06-01T09:00:00Z',
      ended_at: '2025-06-01T09:30:00Z',
      duration_minutes: 30,
      is_billable: true,
      is_running: false,
      created_at: '2025-06-01T09:00:00Z',
      updated_at: '2025-06-01T09:30:00Z',
    };
    const csv = formatTimeEntriesForCSV([entry]);
    const lines = csv.split('\n');
    // description should be empty string between commas
    expect(lines[1]).toContain(',,0.50,');
  });

  it('handles null duration (running timer)', () => {
    const entry: TimeEntry = {
      id: 'e4',
      card_id: 'c1',
      user_id: 'u1',
      board_id: null,
      client_id: null,
      description: 'Ongoing',
      started_at: '2025-06-01T09:00:00Z',
      ended_at: null,
      duration_minutes: null,
      is_billable: true,
      is_running: true,
      created_at: '2025-06-01T09:00:00Z',
      updated_at: '2025-06-01T09:00:00Z',
    };
    const csv = formatTimeEntriesForCSV([entry]);
    expect(csv).toContain('0.00');
  });

  it('formats multiple entries as multiple rows', () => {
    const entries: TimeEntry[] = [
      {
        id: 'e5', card_id: 'c1', user_id: 'u1', board_id: null, client_id: null,
        description: 'A', started_at: '2025-06-01T09:00:00Z', ended_at: '2025-06-01T10:00:00Z',
        duration_minutes: 60, is_billable: true, is_running: false,
        created_at: '2025-06-01T09:00:00Z', updated_at: '2025-06-01T10:00:00Z',
      },
      {
        id: 'e6', card_id: 'c2', user_id: 'u1', board_id: 'b2', client_id: 'cl2',
        description: 'B', started_at: '2025-06-02T11:00:00Z', ended_at: '2025-06-02T12:30:00Z',
        duration_minutes: 90, is_billable: false, is_running: false,
        created_at: '2025-06-02T11:00:00Z', updated_at: '2025-06-02T12:30:00Z',
      },
    ];
    const csv = formatTimeEntriesForCSV(entries);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Date');
    expect(lines[1]).toContain('2025-06-01');
    expect(lines[2]).toContain('2025-06-02');
  });

  it('handles null board_id and client_id as empty strings', () => {
    const entry: TimeEntry = {
      id: 'e7', card_id: 'c1', user_id: 'u1', board_id: null, client_id: null,
      description: 'Test', started_at: '2025-06-01T09:00:00Z', ended_at: '2025-06-01T10:00:00Z',
      duration_minutes: 60, is_billable: true, is_running: false,
      created_at: '2025-06-01T09:00:00Z', updated_at: '2025-06-01T10:00:00Z',
    };
    const csv = formatTimeEntriesForCSV([entry]);
    // Should end with two empty fields
    const lastLine = csv.split('\n')[1];
    expect(lastLine).toMatch(/,,$|,,$/);
  });
});

// ============================================================================
// Timer operations (mock supabase)
// ============================================================================

describe('startTimer', () => {
  it('inserts a new running entry', async () => {
    const mockEntry = { id: 'new-1', is_running: true, card_id: 'c1', user_id: 'u1' };
    const supabase = createMockSupabase({
      single: vi.fn()
        .mockResolvedValueOnce({ data: null, error: null }) // stopRunningTimer lookup
        .mockResolvedValueOnce({ data: mockEntry, error: null }), // insert result
    });

    const result = await startTimer(supabase as any, 'c1', 'u1', { description: 'test' });
    expect(result).toEqual(mockEntry);
    expect(supabase.from).toHaveBeenCalledWith('time_entries');
  });

  it('returns null on insert error', async () => {
    const supabase = createMockSupabase({
      single: vi.fn()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'db error' } }),
    });

    const result = await startTimer(supabase as any, 'c1', 'u1');
    expect(result).toBeNull();
  });
});

describe('stopTimer', () => {
  it('updates a running entry with ended_at and duration', async () => {
    const started = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hr ago
    const mockExisting = { id: 'e1', is_running: true, started_at: started };
    const mockStopped = { ...mockExisting, is_running: false, duration_minutes: 60 };

    const supabase = createMockSupabase({
      single: vi.fn()
        .mockResolvedValueOnce({ data: mockExisting, error: null })
        .mockResolvedValueOnce({ data: mockStopped, error: null }),
    });

    const result = await stopTimer(supabase as any, 'e1');
    expect(result).toEqual(mockStopped);
  });

  it('returns null if entry not found', async () => {
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    });
    const result = await stopTimer(supabase as any, 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns null if entry is not running', async () => {
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValueOnce({ data: { id: 'e1', is_running: false }, error: null }),
    });
    const result = await stopTimer(supabase as any, 'e1');
    expect(result).toBeNull();
  });
});

describe('getRunningTimer', () => {
  it('returns the running entry for a user', async () => {
    const mockEntry = { id: 'e1', is_running: true, user_id: 'u1' };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValueOnce({ data: mockEntry, error: null }),
    });
    const result = await getRunningTimer(supabase as any, 'u1');
    expect(result).toEqual(mockEntry);
  });

  it('returns null if no running timer', async () => {
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValueOnce({ data: null, error: null }),
    });
    const result = await getRunningTimer(supabase as any, 'u1');
    expect(result).toBeNull();
  });
});

// ============================================================================
// Manual entry
// ============================================================================

describe('createManualEntry', () => {
  it('creates entry with calculated duration', async () => {
    const mockEntry = { id: 'me1', duration_minutes: 120 };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValueOnce({ data: mockEntry, error: null }),
    });

    const result = await createManualEntry(supabase as any, {
      cardId: 'c1',
      userId: 'u1',
      startedAt: '2025-06-01T09:00:00Z',
      endedAt: '2025-06-01T11:00:00Z',
    });
    expect(result).toEqual(mockEntry);
  });

  it('returns null if duration is zero or negative', async () => {
    const supabase = createMockSupabase();
    const result = await createManualEntry(supabase as any, {
      cardId: 'c1',
      userId: 'u1',
      startedAt: '2025-06-01T10:00:00Z',
      endedAt: '2025-06-01T09:00:00Z',
    });
    expect(result).toBeNull();
  });
});

// ============================================================================
// Report aggregation
// ============================================================================

describe('getTimeReport', () => {
  it('aggregates minutes by user, board, client', async () => {
    const entries = [
      { id: 'e1', user_id: 'u1', board_id: 'b1', client_id: 'cl1', duration_minutes: 60, is_billable: true, is_running: false, card_id: 'c1', description: null, started_at: '2025-06-01T09:00:00Z', ended_at: '2025-06-01T10:00:00Z', created_at: '', updated_at: '' },
      { id: 'e2', user_id: 'u2', board_id: 'b1', client_id: 'cl1', duration_minutes: 30, is_billable: false, is_running: false, card_id: 'c2', description: null, started_at: '2025-06-01T10:00:00Z', ended_at: '2025-06-01T10:30:00Z', created_at: '', updated_at: '' },
      { id: 'e3', user_id: 'u1', board_id: 'b2', client_id: null, duration_minutes: 45, is_billable: true, is_running: false, card_id: 'c3', description: null, started_at: '2025-06-01T11:00:00Z', ended_at: '2025-06-01T11:45:00Z', created_at: '', updated_at: '' },
    ];

    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      then: undefined as unknown,
    };
    // Make it resolve with data
    Object.defineProperty(chainable, 'then', {
      get() {
        return (resolve: (val: { data: typeof entries }) => void) => resolve({ data: entries });
      },
    });

    // Simpler approach: mock the entire chain
    const supabase = createMockSupabase();
    // Override the last lte call to resolve with data
    (supabase._chain as any).lte = vi.fn().mockResolvedValue({ data: entries });

    const report = await getTimeReport(supabase as any, {
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    expect(report.totalMinutes).toBe(135);
    expect(report.billableMinutes).toBe(105);
    expect(report.nonBillableMinutes).toBe(30);
    expect(report.entries).toHaveLength(3);
    expect(report.byUser?.['u1']).toBe(105);
    expect(report.byUser?.['u2']).toBe(30);
    expect(report.byBoard?.['b1']).toBe(90);
    expect(report.byBoard?.['b2']).toBe(45);
    expect(report.byClient?.['cl1']).toBe(90);
  });

  it('returns zeros when no entries found', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).lte = vi.fn().mockResolvedValue({ data: [] });

    const report = await getTimeReport(supabase as any, {
      startDate: '2025-06-01',
      endDate: '2025-06-30',
    });

    expect(report.totalMinutes).toBe(0);
    expect(report.billableMinutes).toBe(0);
    expect(report.nonBillableMinutes).toBe(0);
    expect(report.entries).toHaveLength(0);
  });
});

describe('getCardTotalTime', () => {
  it('sums minutes correctly', async () => {
    const entries = [
      { id: 'e1', duration_minutes: 60, is_billable: true },
      { id: 'e2', duration_minutes: 45, is_billable: false },
      { id: 'e3', duration_minutes: null, is_billable: true },
    ];
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: entries });

    const result = await getCardTotalTime(supabase as any, 'c1');
    expect(result.totalMinutes).toBe(105);
    expect(result.billableMinutes).toBe(60);
  });
});

describe('deleteTimeEntry', () => {
  it('calls delete on supabase', async () => {
    const supabase = createMockSupabase({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    await deleteTimeEntry(supabase as any, 'e1');
    expect(supabase.from).toHaveBeenCalledWith('time_entries');
  });
});

describe('getUserTimeEntries', () => {
  it('returns entries array', async () => {
    const entries = [{ id: 'e1' }, { id: 'e2' }];
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: entries });

    const result = await getUserTimeEntries(supabase as any, 'u1');
    expect(result).toHaveLength(2);
  });

  it('returns empty array on null data', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: null });

    const result = await getUserTimeEntries(supabase as any, 'u1');
    expect(result).toEqual([]);
  });
});
