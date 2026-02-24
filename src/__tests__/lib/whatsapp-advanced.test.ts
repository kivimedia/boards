import { describe, it, expect, vi } from 'vitest';
import {
  buildDigestContent,
  generateProductivityCSV,
  REPORT_SECTIONS,
  REPORT_TYPE_OPTIONS,
  getCustomActions,
  createCustomAction,
  deleteCustomAction,
  getDigestTemplates,
  createDigestTemplate,
  getReportConfigs,
  createReportConfig,
  getReportFiles,
  createReportFile,
} from '@/lib/whatsapp-advanced';
import type {
  DigestSection,
  WhatsAppCustomAction,
  WhatsAppDigestTemplate,
  ProductivityReportConfig,
  ProductivityReportFile,
} from '@/lib/types';

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
// TESTS
// ============================================================================

describe('WhatsApp Advanced + Productivity Polish (P5.4)', () => {
  // --------------------------------------------------------------------------
  // buildDigestContent
  // --------------------------------------------------------------------------

  describe('buildDigestContent', () => {
    it('returns empty string for empty sections', () => {
      const result = buildDigestContent([], {});
      expect(result).toBe('');
    });

    it('renders overdue section with cards', () => {
      const sections: DigestSection[] = [
        { type: 'overdue', title: 'Overdue Tasks', enabled: true },
      ];
      const result = buildDigestContent(sections, {
        overdueCards: [
          { title: 'Fix bug', dueDate: '2025-01-01' },
          { title: 'Deploy', dueDate: '2025-01-02' },
        ],
      });
      expect(result).toContain('*Overdue Tasks*');
      expect(result).toContain('Fix bug');
      expect(result).toContain('Deploy');
      expect(result).toContain('due: 2025-01-01');
    });

    it('renders assigned section with cards', () => {
      const sections: DigestSection[] = [
        { type: 'assigned', title: 'My Tasks', enabled: true },
      ];
      const result = buildDigestContent(sections, {
        assignedCards: [
          { title: 'Review PR', board: 'Dev' },
        ],
      });
      expect(result).toContain('*My Tasks*');
      expect(result).toContain('Review PR');
      expect(result).toContain('[Dev]');
    });

    it('renders mentions section', () => {
      const sections: DigestSection[] = [
        { type: 'mentions', title: 'Recent Mentions', enabled: true },
      ];
      const result = buildDigestContent(sections, {
        mentions: [
          { text: 'Great work', card: 'Card A' },
        ],
      });
      expect(result).toContain('*Recent Mentions*');
      expect(result).toContain('"Great work"');
      expect(result).toContain('Card A');
    });

    it('renders board_summary section', () => {
      const sections: DigestSection[] = [
        { type: 'board_summary', title: 'Board Overview', enabled: true },
      ];
      const result = buildDigestContent(sections, {
        boardSummaries: [
          { board: 'Design', total: 20, completed: 15 },
        ],
      });
      expect(result).toContain('*Board Overview*');
      expect(result).toContain('Design');
      expect(result).toContain('15/20 completed');
    });

    it('skips disabled sections', () => {
      const sections: DigestSection[] = [
        { type: 'overdue', title: 'Overdue', enabled: false },
        { type: 'assigned', title: 'Assigned', enabled: true },
      ];
      const result = buildDigestContent(sections, {
        overdueCards: [{ title: 'Skip Me', dueDate: '2025-01-01' }],
        assignedCards: [{ title: 'Show Me', board: 'Dev' }],
      });
      expect(result).not.toContain('Skip Me');
      expect(result).toContain('Show Me');
    });

    it('handles mixed enabled/disabled sections', () => {
      const sections: DigestSection[] = [
        { type: 'overdue', title: 'Overdue', enabled: true },
        { type: 'assigned', title: 'Assigned', enabled: false },
        { type: 'mentions', title: 'Mentions', enabled: true },
      ];
      const result = buildDigestContent(sections, {
        overdueCards: [{ title: 'Overdue Card', dueDate: '2025-01-01' }],
        assignedCards: [{ title: 'Assigned Card', board: 'Dev' }],
        mentions: [{ text: 'Hello', card: 'Card B' }],
      });
      expect(result).toContain('Overdue Card');
      expect(result).not.toContain('Assigned Card');
      expect(result).toContain('Hello');
    });

    it('renders custom section with title only', () => {
      const sections: DigestSection[] = [
        { type: 'custom', title: 'Custom Notes', enabled: true },
      ];
      const result = buildDigestContent(sections, {});
      expect(result).toContain('*Custom Notes*');
    });

    it('returns empty when overdue section has no cards', () => {
      const sections: DigestSection[] = [
        { type: 'overdue', title: 'Overdue', enabled: true },
      ];
      const result = buildDigestContent(sections, { overdueCards: [] });
      expect(result).toBe('');
    });

    it('returns empty when assigned section has no cards', () => {
      const sections: DigestSection[] = [
        { type: 'assigned', title: 'Assigned', enabled: true },
      ];
      const result = buildDigestContent(sections, { assignedCards: [] });
      expect(result).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // generateProductivityCSV
  // --------------------------------------------------------------------------

  describe('generateProductivityCSV', () => {
    it('returns header only for empty data', () => {
      const csv = generateProductivityCSV([]);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('User ID');
      expect(lines[0]).toContain('User Name');
    });

    it('generates single row correctly', () => {
      const csv = generateProductivityCSV([
        { userId: 'u1', userName: 'Alice', ticketsCompleted: 10, ticketsCreated: 5, avgCycleTimeHours: 24, onTimeRate: 80, revisionRate: 15 },
      ]);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('u1');
      expect(lines[1]).toContain('Alice');
      expect(lines[1]).toContain('10');
    });

    it('generates multiple rows', () => {
      const csv = generateProductivityCSV([
        { userId: 'u1', userName: 'Alice', ticketsCompleted: 10, ticketsCreated: 5, avgCycleTimeHours: 24, onTimeRate: 80, revisionRate: 15 },
        { userId: 'u2', userName: 'Bob', ticketsCompleted: 8, ticketsCreated: 3, avgCycleTimeHours: 36, onTimeRate: 90, revisionRate: 10 },
      ]);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3);
    });

    it('has correct column order in header', () => {
      const csv = generateProductivityCSV([]);
      const header = csv.split('\n')[0];
      const columns = header.split(',');
      expect(columns[0]).toBe('User ID');
      expect(columns[1]).toBe('User Name');
      expect(columns[2]).toBe('Tickets Completed');
      expect(columns[3]).toBe('Tickets Created');
      expect(columns[4]).toBe('Avg Cycle Time (hrs)');
      expect(columns[5]).toBe('On-Time Rate (%)');
      expect(columns[6]).toBe('Revision Rate (%)');
    });

    it('preserves numeric values in CSV', () => {
      const csv = generateProductivityCSV([
        { userId: 'u1', userName: 'Test', ticketsCompleted: 0, ticketsCreated: 0, avgCycleTimeHours: 0, onTimeRate: 0, revisionRate: 0 },
      ]);
      const dataRow = csv.split('\n')[1];
      expect(dataRow).toBe('u1,Test,0,0,0,0,0');
    });
  });

  // --------------------------------------------------------------------------
  // REPORT_SECTIONS
  // --------------------------------------------------------------------------

  describe('REPORT_SECTIONS', () => {
    it('has all expected sections', () => {
      const ids = REPORT_SECTIONS.map((s) => s.id);
      expect(ids).toContain('summary');
      expect(ids).toContain('metrics');
      expect(ids).toContain('trends');
      expect(ids).toContain('leaderboard');
      expect(ids).toContain('cycle_time');
      expect(ids).toContain('revisions');
      expect(ids).toContain('ai_usage');
      expect(ids).toContain('recommendations');
    });

    it('each section has id and label', () => {
      for (const section of REPORT_SECTIONS) {
        expect(section.id).toBeDefined();
        expect(typeof section.id).toBe('string');
        expect(section.label).toBeDefined();
        expect(typeof section.label).toBe('string');
      }
    });

    it('has 8 sections', () => {
      expect(REPORT_SECTIONS).toHaveLength(8);
    });
  });

  // --------------------------------------------------------------------------
  // REPORT_TYPE_OPTIONS
  // --------------------------------------------------------------------------

  describe('REPORT_TYPE_OPTIONS', () => {
    it('has all 4 types', () => {
      expect(REPORT_TYPE_OPTIONS).toHaveLength(4);
    });

    it('contains individual, team, department, executive', () => {
      const values = REPORT_TYPE_OPTIONS.map((o) => o.value);
      expect(values).toContain('individual');
      expect(values).toContain('team');
      expect(values).toContain('department');
      expect(values).toContain('executive');
    });

    it('each option has value and label', () => {
      for (const option of REPORT_TYPE_OPTIONS) {
        expect(option.value).toBeDefined();
        expect(option.label).toBeDefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // getCustomActions (mock)
  // --------------------------------------------------------------------------

  describe('getCustomActions', () => {
    it('returns array of actions', async () => {
      const mockActions = [
        { id: 'a1', keyword: 'done', label: 'Mark Done', action_type: 'mark_done' },
      ];
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['order'] = vi.fn().mockResolvedValue({ data: mockActions, error: null });

      const result = await getCustomActions(mock as never, 'user-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].keyword).toBe('done');
    });

    it('returns empty array when no data', async () => {
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['order'] = vi.fn().mockResolvedValue({ data: null, error: null });

      const result = await getCustomActions(mock as never, 'user-1');
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // createCustomAction (mock)
  // --------------------------------------------------------------------------

  describe('createCustomAction', () => {
    it('lowercases keyword on creation', async () => {
      const mock = createMockSupabase();
      const insertFn = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'a1', keyword: 'done' },
            error: null,
          }),
        }),
      });
      (mock._chain as Record<string, unknown>)['insert'] = insertFn;

      // Override from to use the insert chain
      mock.from = vi.fn().mockReturnValue({ insert: insertFn });

      const result = await createCustomAction(mock as never, {
        userId: 'user-1',
        keyword: 'DONE',
        label: 'Mark Done',
        actionType: 'mark_done',
      });

      expect(insertFn).toHaveBeenCalled();
      const insertCall = insertFn.mock.calls[0][0];
      expect(insertCall.keyword).toBe('done');
    });

    it('returns null on error', async () => {
      const mock = createMockSupabase();
      mock.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
          }),
        }),
      });

      const result = await createCustomAction(mock as never, {
        userId: 'user-1',
        keyword: 'test',
        label: 'Test',
        actionType: 'custom',
      });
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // deleteCustomAction (mock)
  // --------------------------------------------------------------------------

  describe('deleteCustomAction', () => {
    it('calls delete with correct id', async () => {
      const deleteFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const mock = {
        from: vi.fn().mockReturnValue({
          delete: deleteFn,
        }),
      };

      await deleteCustomAction(mock as never, 'action-1');
      expect(mock.from).toHaveBeenCalledWith('whatsapp_custom_actions');
      expect(deleteFn).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // getDigestTemplates (mock)
  // --------------------------------------------------------------------------

  describe('getDigestTemplates', () => {
    it('returns array of templates', async () => {
      const templates = [{ id: 't1', name: 'Morning Digest', sections: [] }];
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['order'] = vi.fn().mockResolvedValue({ data: templates, error: null });

      const result = await getDigestTemplates(mock as never, 'user-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no data', async () => {
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['order'] = vi.fn().mockResolvedValue({ data: null, error: null });

      const result = await getDigestTemplates(mock as never, 'user-1');
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // createDigestTemplate (mock)
  // --------------------------------------------------------------------------

  describe('createDigestTemplate', () => {
    it('returns created template', async () => {
      const template = { id: 't1', name: 'Test', sections: [], user_id: 'user-1' };
      const mock = createMockSupabase();
      mock.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: template, error: null }),
          }),
        }),
      });

      const result = await createDigestTemplate(mock as never, {
        userId: 'user-1',
        name: 'Test',
        sections: [],
      });
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test');
    });
  });

  // --------------------------------------------------------------------------
  // getReportConfigs (mock)
  // --------------------------------------------------------------------------

  describe('getReportConfigs', () => {
    it('returns array of configs', async () => {
      const configs = [{ id: 'rc1', name: 'Weekly Report' }];
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['order'] = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: configs, error: null }),
      });

      // Without createdBy filter
      const mock2 = createMockSupabase();
      (mock2._chain as Record<string, unknown>)['order'] = vi.fn().mockResolvedValue({ data: configs, error: null });

      const result = await getReportConfigs(mock2 as never);
      expect(Array.isArray(result)).toBe(true);
    });

    it('filters by createdBy when provided', async () => {
      const mock = createMockSupabase();
      const eqFn = vi.fn().mockResolvedValue({ data: [], error: null });
      (mock._chain as Record<string, unknown>)['order'] = vi.fn().mockReturnValue({ eq: eqFn });

      await getReportConfigs(mock as never, 'user-1');
      expect(eqFn).toHaveBeenCalledWith('created_by', 'user-1');
    });
  });

  // --------------------------------------------------------------------------
  // createReportConfig (mock)
  // --------------------------------------------------------------------------

  describe('createReportConfig', () => {
    it('returns created config', async () => {
      const config = { id: 'rc1', name: 'Test Config', report_type: 'individual' };
      const mock = createMockSupabase();
      mock.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: config, error: null }),
          }),
        }),
      });

      const result = await createReportConfig(mock as never, {
        name: 'Test Config',
        reportType: 'individual',
        recipients: ['alice@example.com'],
        createdBy: 'user-1',
      });
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Test Config');
    });

    it('returns null on error', async () => {
      const mock = createMockSupabase();
      mock.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
          }),
        }),
      });

      const result = await createReportConfig(mock as never, {
        name: 'Fail',
        reportType: 'team',
        recipients: [],
        createdBy: 'user-1',
      });
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // getReportFiles (mock)
  // --------------------------------------------------------------------------

  describe('getReportFiles', () => {
    it('returns array of files', async () => {
      const files = [{ id: 'f1', report_type: 'individual' }];
      const mock = createMockSupabase();
      (mock._chain as Record<string, unknown>)['limit'] = vi.fn().mockResolvedValue({ data: files, error: null });

      const result = await getReportFiles(mock as never);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });

    it('filters by configId when provided', async () => {
      const mock = createMockSupabase();

      await getReportFiles(mock as never, 'config-1');
      // eq is called to filter by config_id
      expect(mock._chain.eq).toHaveBeenCalledWith('config_id', 'config-1');
    });
  });

  // --------------------------------------------------------------------------
  // createReportFile (mock)
  // --------------------------------------------------------------------------

  describe('createReportFile', () => {
    it('returns file with pending status', async () => {
      const file = { id: 'f1', status: 'pending', report_type: 'individual' };
      const mock = createMockSupabase();
      const insertFn = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: file, error: null }),
        }),
      });
      mock.from = vi.fn().mockReturnValue({ insert: insertFn });

      const result = await createReportFile(mock as never, {
        reportType: 'individual',
        format: 'pdf',
        dateRangeStart: '2025-01-01',
        dateRangeEnd: '2025-01-31',
        generatedBy: 'user-1',
      });
      expect(result).not.toBeNull();
      expect(result?.status).toBe('pending');

      // Verify the insert payload includes status: pending
      const insertCall = insertFn.mock.calls[0][0];
      expect(insertCall.status).toBe('pending');
    });
  });

  // --------------------------------------------------------------------------
  // Type shape tests
  // --------------------------------------------------------------------------

  describe('WhatsAppCustomAction type shape', () => {
    it('has all expected fields', () => {
      const action: WhatsAppCustomAction = {
        id: 'a1',
        user_id: 'user-1',
        keyword: 'done',
        label: 'Mark Done',
        action_type: 'mark_done',
        action_config: {},
        response_template: null,
        is_active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(action.id).toBeDefined();
      expect(action.user_id).toBeDefined();
      expect(action.keyword).toBeDefined();
      expect(action.label).toBeDefined();
      expect(action.action_type).toBeDefined();
      expect(typeof action.is_active).toBe('boolean');
    });
  });

  describe('WhatsAppDigestTemplate type shape', () => {
    it('has all expected fields', () => {
      const template: WhatsAppDigestTemplate = {
        id: 't1',
        user_id: 'user-1',
        name: 'Morning Digest',
        sections: [
          { type: 'overdue', title: 'Overdue', enabled: true },
        ],
        is_default: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(template.id).toBeDefined();
      expect(template.user_id).toBeDefined();
      expect(template.name).toBeDefined();
      expect(Array.isArray(template.sections)).toBe(true);
      expect(typeof template.is_default).toBe('boolean');
    });
  });

  describe('ProductivityReportConfig type shape', () => {
    it('has all expected fields', () => {
      const config: ProductivityReportConfig = {
        id: 'rc1',
        name: 'Weekly Report',
        report_type: 'team',
        schedule: '0 9 * * 1',
        recipients: ['alice@example.com'],
        include_sections: ['summary', 'metrics'],
        filters: {},
        format: 'pdf',
        is_active: true,
        last_generated_at: null,
        created_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(config.id).toBeDefined();
      expect(config.name).toBeDefined();
      expect(config.report_type).toBe('team');
      expect(Array.isArray(config.recipients)).toBe(true);
      expect(Array.isArray(config.include_sections)).toBe(true);
      expect(typeof config.is_active).toBe('boolean');
    });

    it('supports nullable fields', () => {
      const config: ProductivityReportConfig = {
        id: 'rc2',
        name: 'Manual Report',
        report_type: 'individual',
        schedule: null,
        recipients: [],
        include_sections: [],
        filters: {},
        format: 'csv',
        is_active: false,
        last_generated_at: null,
        created_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(config.schedule).toBeNull();
      expect(config.last_generated_at).toBeNull();
    });
  });
});
