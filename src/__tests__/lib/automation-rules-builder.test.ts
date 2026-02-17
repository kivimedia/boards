import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateNextCreateAt,
  TRIGGER_OPTIONS,
  ACTION_OPTIONS,
  getAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  reorderAutomationRules,
  logExecution,
  getExecutionLogs,
  createRecurringCard,
  getRecurringCards,
  updateRecurringCard,
  deleteRecurringCard,
} from '../../lib/automation-rules-builder';

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
// calculateNextCreateAt
// ============================================================================

describe('calculateNextCreateAt', () => {
  it('returns a valid ISO date string', () => {
    const result = calculateNextCreateAt('daily');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(result).getTime()).not.toBeNaN();
  });

  it('daily: returns a date in the future', () => {
    const result = calculateNextCreateAt('daily', null, '09:00');
    const nextDate = new Date(result);
    // Should be at most ~25 hours from now
    expect(nextDate.getTime()).toBeGreaterThan(Date.now() - 60000);
  });

  it('daily: sets correct time', () => {
    const result = calculateNextCreateAt('daily', null, '14:30');
    const d = new Date(result);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it('weekly: returns a date in the future', () => {
    const result = calculateNextCreateAt('weekly', 1, '09:00');
    const nextDate = new Date(result);
    expect(nextDate.getTime()).toBeGreaterThan(Date.now() - 60000);
    expect(nextDate.getDay()).toBe(1); // Monday
  });

  it('weekly: day 0 means Sunday', () => {
    const result = calculateNextCreateAt('weekly', 0, '09:00');
    const nextDate = new Date(result);
    expect(nextDate.getDay()).toBe(0);
  });

  it('weekly: day 5 means Friday', () => {
    const result = calculateNextCreateAt('weekly', 5, '09:00');
    const nextDate = new Date(result);
    expect(nextDate.getDay()).toBe(5);
  });

  it('biweekly: returns a date at least 7 days from now', () => {
    const result = calculateNextCreateAt('biweekly', 1, '09:00');
    const nextDate = new Date(result);
    const sevenDaysFromNow = Date.now() + 6 * 24 * 60 * 60 * 1000;
    expect(nextDate.getTime()).toBeGreaterThan(sevenDaysFromNow);
  });

  it('monthly: returns a future date with correct day of month', () => {
    const result = calculateNextCreateAt('monthly', 15, '09:00');
    const nextDate = new Date(result);
    expect(nextDate.getDate()).toBe(15);
    expect(nextDate.getTime()).toBeGreaterThan(Date.now() - 60000);
  });

  it('monthly: uses day 1 by default', () => {
    const result = calculateNextCreateAt('monthly', undefined, '09:00');
    const nextDate = new Date(result);
    expect(nextDate.getDate()).toBe(1);
  });

  it('quarterly: returns a date in the future', () => {
    const result = calculateNextCreateAt('quarterly', 1, '09:00');
    const nextDate = new Date(result);
    expect(nextDate.getTime()).toBeGreaterThan(Date.now() - 60000);
  });

  it('quarterly: sets correct day', () => {
    const result = calculateNextCreateAt('quarterly', 10, '09:00');
    const nextDate = new Date(result);
    expect(nextDate.getDate()).toBe(10);
  });

  it('defaults to 09:00 when no time provided', () => {
    const result = calculateNextCreateAt('daily');
    const d = new Date(result);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it('unknown pattern falls back to +1 day', () => {
    const result = calculateNextCreateAt('unknown_pattern');
    const nextDate = new Date(result);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Should be roughly tomorrow
    expect(nextDate.getDate()).toBe(tomorrow.getDate());
  });
});

// ============================================================================
// TRIGGER_OPTIONS / ACTION_OPTIONS structure
// ============================================================================

describe('TRIGGER_OPTIONS', () => {
  it('is an array of at least 5 options', () => {
    expect(Array.isArray(TRIGGER_OPTIONS)).toBe(true);
    expect(TRIGGER_OPTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('each option has value, label, and config', () => {
    for (const opt of TRIGGER_OPTIONS) {
      expect(typeof opt.value).toBe('string');
      expect(typeof opt.label).toBe('string');
      expect(Array.isArray(opt.config)).toBe(true);
    }
  });

  it('contains card_moved trigger', () => {
    const cardMoved = TRIGGER_OPTIONS.find((t) => t.value === 'card_moved');
    expect(cardMoved).toBeDefined();
    expect(cardMoved!.config).toContain('from_list');
    expect(cardMoved!.config).toContain('to_list');
  });

  it('contains due_date_passed trigger', () => {
    const trigger = TRIGGER_OPTIONS.find((t) => t.value === 'due_date_passed');
    expect(trigger).toBeDefined();
    expect(trigger!.config).toContain('offset_hours');
  });

  it('contains checklist_completed trigger with empty config', () => {
    const trigger = TRIGGER_OPTIONS.find((t) => t.value === 'checklist_completed');
    expect(trigger).toBeDefined();
    expect(trigger!.config).toHaveLength(0);
  });
});

describe('ACTION_OPTIONS', () => {
  it('is an array of at least 5 options', () => {
    expect(Array.isArray(ACTION_OPTIONS)).toBe(true);
    expect(ACTION_OPTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('each option has value, label, and config', () => {
    for (const opt of ACTION_OPTIONS) {
      expect(typeof opt.value).toBe('string');
      expect(typeof opt.label).toBe('string');
      expect(Array.isArray(opt.config)).toBe(true);
    }
  });

  it('contains move_card action', () => {
    const moveCard = ACTION_OPTIONS.find((a) => a.value === 'move_card');
    expect(moveCard).toBeDefined();
    expect(moveCard!.config).toContain('target_list');
  });

  it('contains send_notification action', () => {
    const action = ACTION_OPTIONS.find((a) => a.value === 'send_notification');
    expect(action).toBeDefined();
    expect(action!.config).toContain('user_id');
    expect(action!.config).toContain('message');
  });

  it('all trigger values are unique', () => {
    const values = TRIGGER_OPTIONS.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('all action values are unique', () => {
    const values = ACTION_OPTIONS.map((a) => a.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

// ============================================================================
// Rule CRUD (mock supabase)
// ============================================================================

describe('getAutomationRules', () => {
  it('returns rules array', async () => {
    const rules = [{ id: 'r1', name: 'Rule 1' }, { id: 'r2', name: 'Rule 2' }];
    const supabase = createMockSupabase({
      order: vi.fn().mockResolvedValue({ data: rules }),
    });

    const result = await getAutomationRules(supabase as any, 'board-1');
    expect(result).toHaveLength(2);
    expect(supabase.from).toHaveBeenCalledWith('automation_rules');
  });

  it('returns empty array when data is null', async () => {
    const supabase = createMockSupabase({
      order: vi.fn().mockResolvedValue({ data: null }),
    });

    const result = await getAutomationRules(supabase as any, 'board-1');
    expect(result).toEqual([]);
  });
});

describe('createAutomationRule', () => {
  it('creates a rule with next execution order', async () => {
    const mockRule = { id: 'r1', name: 'Test', execution_order: 2 };
    const supabase = createMockSupabase({
      limit: vi.fn().mockResolvedValueOnce({ data: [{ execution_order: 1 }] }),
      single: vi.fn().mockResolvedValueOnce({ data: mockRule, error: null }),
    });

    const result = await createAutomationRule(supabase as any, {
      boardId: 'b1',
      name: 'Test',
      triggerType: 'card_moved',
      triggerConfig: {},
      actionType: 'move_card',
      actionConfig: {},
      createdBy: 'u1',
    });

    expect(result).toEqual(mockRule);
  });

  it('returns null on error', async () => {
    const supabase = createMockSupabase({
      limit: vi.fn().mockResolvedValueOnce({ data: [] }),
      single: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'err' } }),
    });

    const result = await createAutomationRule(supabase as any, {
      boardId: 'b1',
      name: 'Test',
      triggerType: 'card_moved',
      triggerConfig: {},
      actionType: 'move_card',
      actionConfig: {},
      createdBy: 'u1',
    });

    expect(result).toBeNull();
  });
});

describe('updateAutomationRule', () => {
  it('updates a rule', async () => {
    const updated = { id: 'r1', name: 'Updated', is_active: false };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValueOnce({ data: updated, error: null }),
    });

    const result = await updateAutomationRule(supabase as any, 'r1', { name: 'Updated' });
    expect(result).toEqual(updated);
  });
});

describe('deleteAutomationRule', () => {
  it('calls delete on the correct table', async () => {
    const supabase = createMockSupabase({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    await deleteAutomationRule(supabase as any, 'r1');
    expect(supabase.from).toHaveBeenCalledWith('automation_rules');
  });
});

describe('reorderAutomationRules', () => {
  it('updates execution_order for each rule', async () => {
    const supabase = createMockSupabase({
      eq: vi.fn().mockReturnThis(),
    });
    // The second eq call needs to resolve
    let callCount = 0;
    (supabase._chain as any).eq = vi.fn().mockImplementation(() => {
      callCount++;
      return supabase._chain;
    });

    await reorderAutomationRules(supabase as any, 'b1', ['r1', 'r2', 'r3']);
    // Should call from('automation_rules') for each rule
    expect(supabase.from).toHaveBeenCalledWith('automation_rules');
  });
});

// ============================================================================
// Execution log
// ============================================================================

describe('logExecution', () => {
  it('inserts a log entry', async () => {
    const supabase = createMockSupabase({
      insert: vi.fn().mockResolvedValueOnce({ error: null }),
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    await logExecution(supabase as any, {
      ruleId: 'r1',
      triggerData: { from: 'todo' },
      actionData: { to: 'done' },
      status: 'success',
    });

    expect(supabase.from).toHaveBeenCalledWith('automation_execution_log');
  });
});

describe('getExecutionLogs', () => {
  it('returns logs array', async () => {
    const logs = [{ id: 'l1', status: 'success' }];
    const supabase = createMockSupabase({
      limit: vi.fn().mockResolvedValue({ data: logs }),
    });

    const result = await getExecutionLogs(supabase as any, {});
    expect(result).toHaveLength(1);
  });

  it('returns empty array on null data', async () => {
    const supabase = createMockSupabase({
      limit: vi.fn().mockResolvedValue({ data: null }),
    });

    const result = await getExecutionLogs(supabase as any, {});
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Recurring cards
// ============================================================================

describe('createRecurringCard', () => {
  it('creates a recurring card with next_create_at', async () => {
    const mockCard = { id: 'rc1', title: 'Weekly standup', next_create_at: '2025-06-08T09:00:00Z' };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValueOnce({ data: mockCard, error: null }),
    });

    const result = await createRecurringCard(supabase as any, {
      boardId: 'b1',
      listId: 'l1',
      title: 'Weekly standup',
      recurrencePattern: 'weekly',
      createdBy: 'u1',
    });

    expect(result).toEqual(mockCard);
  });

  it('returns null on error', async () => {
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'err' } }),
    });

    const result = await createRecurringCard(supabase as any, {
      boardId: 'b1',
      listId: 'l1',
      title: 'Test',
      recurrencePattern: 'daily',
      createdBy: 'u1',
    });

    expect(result).toBeNull();
  });
});

describe('getRecurringCards', () => {
  it('returns cards array', async () => {
    const cards = [{ id: 'rc1' }, { id: 'rc2' }];
    const supabase = createMockSupabase({
      order: vi.fn().mockResolvedValue({ data: cards }),
    });

    const result = await getRecurringCards(supabase as any, 'b1');
    expect(result).toHaveLength(2);
  });
});

describe('deleteRecurringCard', () => {
  it('calls delete', async () => {
    const supabase = createMockSupabase({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    await deleteRecurringCard(supabase as any, 'rc1');
    expect(supabase.from).toHaveBeenCalledWith('recurring_cards');
  });
});
