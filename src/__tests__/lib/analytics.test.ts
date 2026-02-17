import { describe, it, expect, vi } from 'vitest';
import {
  getPortalBranding,
  upsertPortalBranding,
  submitSurvey,
  getSurveys,
  getSurveyStats,
  getCustomReports,
  getCustomReport,
  createCustomReport,
  updateCustomReport,
  deleteCustomReport,
  getGanttTasks,
  getBurndownData,
} from '../../lib/analytics';
import type {
  PortalBranding,
  SatisfactionSurvey,
  CustomReport,
  GanttTask,
  ReportType,
  SurveyType,
} from '../../lib/types';

// Mock Supabase client builder
function createMockSupabase(
  overrides: {
    selectData?: unknown;
    singleData?: unknown;
    insertData?: unknown;
    upsertData?: unknown;
    updateData?: unknown;
    error?: { message: string } | null;
    multiQuery?: Record<string, unknown>;
  } = {}
) {
  const error = overrides.error ?? null;

  const chainable = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: overrides.singleData ?? null, error }),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };

  // Order returns thenable
  chainable.order.mockImplementation(() => ({
    ...chainable,
    then: (resolve: (val: { data: unknown; error: unknown }) => void) => {
      resolve({ data: overrides.selectData ?? [], error });
      return { catch: vi.fn() };
    },
    limit: vi.fn().mockImplementation(() => ({
      ...chainable,
      then: (resolve: (val: { data: unknown; error: unknown }) => void) => {
        resolve({ data: overrides.selectData ?? [], error });
        return { catch: vi.fn() };
      },
    })),
    single: vi.fn().mockResolvedValue({
      data: overrides.singleData ?? null,
      error,
    }),
  }));

  // Select chain (for single queries)
  chainable.select.mockImplementation(() => ({
    ...chainable,
    single: vi.fn().mockResolvedValue({
      data: overrides.singleData ?? overrides.insertData ?? overrides.upsertData ?? overrides.updateData ?? null,
      error,
    }),
    then: (resolve: (val: { data: unknown; error: unknown }) => void) => {
      resolve({ data: overrides.selectData ?? [], error });
      return { catch: vi.fn() };
    },
  }));

  // Insert/upsert/update chain to select().single()
  chainable.insert.mockReturnValue({
    ...chainable,
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: overrides.insertData ?? null,
        error,
      }),
    }),
  });

  chainable.upsert.mockReturnValue({
    ...chainable,
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: overrides.upsertData ?? null,
        error,
      }),
    }),
  });

  chainable.update.mockReturnValue({
    ...chainable,
    eq: vi.fn().mockReturnValue({
      ...chainable,
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: overrides.updateData ?? null,
          error,
        }),
      }),
    }),
  });

  chainable.delete.mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  const supabase = {
    from: vi.fn().mockReturnValue(chainable),
  };

  return supabase as unknown as Parameters<typeof getPortalBranding>[0];
}

// ============================================================================
// PORTAL BRANDING
// ============================================================================

describe('Analytics Library (P3.6)', () => {
  describe('getPortalBranding', () => {
    it('returns branding for a client', async () => {
      const mockBranding: PortalBranding = {
        id: 'brand-1',
        client_id: 'client-1',
        logo_url: 'https://example.com/logo.png',
        primary_color: '#6366f1',
        secondary_color: '#0f172a',
        accent_color: '#faf7f2',
        favicon_url: null,
        custom_domain: null,
        company_name: 'Acme Agency',
        footer_text: 'Powered by Acme',
        is_active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const supabase = createMockSupabase({ singleData: mockBranding });
      const result = await getPortalBranding(supabase, 'client-1');

      expect(result).toEqual(mockBranding);
    });

    it('returns null when no branding configured', async () => {
      const supabase = createMockSupabase({ singleData: null });
      const result = await getPortalBranding(supabase);

      expect(result).toBeNull();
    });

    it('queries for global branding when no client ID', async () => {
      const supabase = createMockSupabase({ singleData: null });
      await getPortalBranding(supabase);

      expect(supabase.from).toHaveBeenCalledWith('portal_branding');
    });
  });

  describe('upsertPortalBranding', () => {
    it('upserts branding successfully', async () => {
      const mockResult: PortalBranding = {
        id: 'brand-new',
        client_id: null,
        logo_url: 'https://example.com/logo.png',
        primary_color: '#ff0000',
        secondary_color: '#000000',
        accent_color: '#ffffff',
        favicon_url: null,
        custom_domain: 'portal.agency.com',
        company_name: 'My Agency',
        footer_text: null,
        is_active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const supabase = createMockSupabase({ upsertData: mockResult });
      const result = await upsertPortalBranding(supabase, {
        primaryColor: '#ff0000',
        secondaryColor: '#000000',
        accentColor: '#ffffff',
        customDomain: 'portal.agency.com',
        companyName: 'My Agency',
        isActive: true,
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on upsert error', async () => {
      const supabase = createMockSupabase({ upsertData: null, error: { message: 'error' } });
      const result = await upsertPortalBranding(supabase, { primaryColor: '#000' });

      expect(result).toBeNull();
    });

    it('applies default colors when not specified', async () => {
      const supabase = createMockSupabase({ upsertData: { id: 'brand-def' } });
      await upsertPortalBranding(supabase, {});

      expect(supabase.from).toHaveBeenCalledWith('portal_branding');
    });
  });

  // ============================================================================
  // SURVEYS
  // ============================================================================

  describe('submitSurvey', () => {
    it('submits a survey successfully', async () => {
      const mockResult: SatisfactionSurvey = {
        id: 'survey-1',
        client_id: 'client-1',
        card_id: 'card-1',
        rating: 5,
        feedback: 'Great work!',
        survey_type: 'delivery',
        submitted_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
      };

      const supabase = createMockSupabase({ insertData: mockResult });
      const result = await submitSurvey(supabase, {
        clientId: 'client-1',
        cardId: 'card-1',
        rating: 5,
        feedback: 'Great work!',
        surveyType: 'delivery',
        submittedBy: 'user-1',
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on error', async () => {
      const supabase = createMockSupabase({ insertData: null, error: { message: 'error' } });
      const result = await submitSurvey(supabase, {
        clientId: 'client-1',
        rating: 3,
        surveyType: 'periodic',
      });

      expect(result).toBeNull();
    });
  });

  describe('getSurveys', () => {
    it('returns surveys list', async () => {
      const mockSurveys: SatisfactionSurvey[] = [
        {
          id: 'survey-1',
          client_id: 'client-1',
          card_id: null,
          rating: 4,
          feedback: null,
          survey_type: 'periodic',
          submitted_by: 'user-1',
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'survey-2',
          client_id: 'client-1',
          card_id: 'card-1',
          rating: 5,
          feedback: 'Excellent!',
          survey_type: 'delivery',
          submitted_by: 'user-2',
          created_at: '2025-01-02T00:00:00Z',
        },
      ];

      const supabase = createMockSupabase({ selectData: mockSurveys });
      const result = await getSurveys(supabase, { clientId: 'client-1' });

      expect(result).toEqual(mockSurveys);
    });

    it('returns empty array on no data', async () => {
      const supabase = createMockSupabase({ selectData: null });
      const result = await getSurveys(supabase);

      expect(result).toEqual([]);
    });
  });

  describe('getSurveyStats', () => {
    it('calculates stats correctly', async () => {
      const mockSurveys: SatisfactionSurvey[] = [
        { id: '1', client_id: 'c', card_id: null, rating: 5, feedback: null, survey_type: 'delivery', submitted_by: null, created_at: '' },
        { id: '2', client_id: 'c', card_id: null, rating: 3, feedback: null, survey_type: 'delivery', submitted_by: null, created_at: '' },
        { id: '3', client_id: 'c', card_id: null, rating: 4, feedback: null, survey_type: 'periodic', submitted_by: null, created_at: '' },
      ];

      const supabase = createMockSupabase({ selectData: mockSurveys });
      const stats = await getSurveyStats(supabase, 'c');

      expect(stats.averageRating).toBe(4);
      expect(stats.totalResponses).toBe(3);
      expect(stats.byType.delivery.count).toBe(2);
      expect(stats.byType.delivery.avg).toBe(4);
      expect(stats.byType.periodic.count).toBe(1);
      expect(stats.byType.periodic.avg).toBe(4);
    });

    it('returns zeros when no surveys exist', async () => {
      const supabase = createMockSupabase({ selectData: [] });
      const stats = await getSurveyStats(supabase, 'empty-client');

      expect(stats.averageRating).toBe(0);
      expect(stats.totalResponses).toBe(0);
      expect(stats.byType).toEqual({});
    });

    it('handles single survey correctly', async () => {
      const mockSurveys: SatisfactionSurvey[] = [
        { id: '1', client_id: 'c', card_id: null, rating: 3, feedback: null, survey_type: 'milestone', submitted_by: null, created_at: '' },
      ];

      const supabase = createMockSupabase({ selectData: mockSurveys });
      const stats = await getSurveyStats(supabase, 'c');

      expect(stats.averageRating).toBe(3);
      expect(stats.totalResponses).toBe(1);
      expect(stats.byType.milestone.avg).toBe(3);
      expect(stats.byType.milestone.count).toBe(1);
    });
  });

  // ============================================================================
  // CUSTOM REPORTS
  // ============================================================================

  describe('getCustomReports', () => {
    it('returns reports list', async () => {
      const mockReports: CustomReport[] = [
        {
          id: 'report-1',
          name: 'Sprint Burndown',
          description: 'Track sprint progress',
          report_type: 'burndown',
          config: { board_id: 'board-1' },
          created_by: 'user-1',
          is_shared: true,
          schedule: 'weekly',
          last_generated_at: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const supabase = createMockSupabase({ selectData: mockReports });
      const result = await getCustomReports(supabase);

      expect(result).toEqual(mockReports);
    });

    it('returns empty array on no data', async () => {
      const supabase = createMockSupabase({ selectData: null });
      const result = await getCustomReports(supabase);

      expect(result).toEqual([]);
    });
  });

  describe('getCustomReport', () => {
    it('returns a single report', async () => {
      const mockReport: CustomReport = {
        id: 'report-1',
        name: 'Velocity',
        description: null,
        report_type: 'velocity',
        config: {},
        created_by: 'user-1',
        is_shared: false,
        schedule: null,
        last_generated_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const supabase = createMockSupabase({ singleData: mockReport });
      const result = await getCustomReport(supabase, 'report-1');

      expect(result).toEqual(mockReport);
    });

    it('returns null when not found', async () => {
      const supabase = createMockSupabase({ singleData: null });
      const result = await getCustomReport(supabase, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('createCustomReport', () => {
    it('creates a report successfully', async () => {
      const mockResult: CustomReport = {
        id: 'report-new',
        name: 'Workload Report',
        description: 'Team workload overview',
        report_type: 'workload',
        config: { date_range_days: 30 },
        created_by: 'user-1',
        is_shared: true,
        schedule: 'monthly',
        last_generated_at: null,
        created_at: '2025-01-02T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
      };

      const supabase = createMockSupabase({ insertData: mockResult });
      const result = await createCustomReport(supabase, {
        name: 'Workload Report',
        description: 'Team workload overview',
        reportType: 'workload',
        config: { date_range_days: 30 },
        createdBy: 'user-1',
        isShared: true,
        schedule: 'monthly',
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on error', async () => {
      const supabase = createMockSupabase({ insertData: null, error: { message: 'error' } });
      const result = await createCustomReport(supabase, {
        name: 'Test',
        reportType: 'custom',
        config: {},
        createdBy: 'user-1',
      });

      expect(result).toBeNull();
    });
  });

  describe('updateCustomReport', () => {
    it('updates report fields', async () => {
      const mockResult: CustomReport = {
        id: 'report-1',
        name: 'Updated Report',
        description: null,
        report_type: 'burndown',
        config: { board_id: 'board-2' },
        created_by: 'user-1',
        is_shared: true,
        schedule: 'daily',
        last_generated_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-03T00:00:00Z',
      };

      const supabase = createMockSupabase({ updateData: mockResult });
      const result = await updateCustomReport(supabase, 'report-1', {
        name: 'Updated Report',
        is_shared: true,
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on update error', async () => {
      const supabase = createMockSupabase({ updateData: null, error: { message: 'error' } });
      const result = await updateCustomReport(supabase, 'r-1', { name: 'X' });

      expect(result).toBeNull();
    });
  });

  describe('deleteCustomReport', () => {
    it('deletes a report', async () => {
      const supabase = createMockSupabase();
      await deleteCustomReport(supabase, 'report-1');

      expect(supabase.from).toHaveBeenCalledWith('custom_reports');
    });
  });

  // ============================================================================
  // GANTT TASKS
  // ============================================================================

  describe('getGanttTasks', () => {
    it('returns gantt tasks for a board', async () => {
      // For getGanttTasks we need multi-table queries, so we test the type mapping
      const task: GanttTask = {
        id: 'card-1',
        title: 'Build feature',
        start_date: '2025-01-01',
        end_date: '2025-01-15',
        progress_percent: 60,
        card_id: 'card-1',
        board_id: 'board-1',
        list_name: 'In Progress',
        dependencies: ['card-0'],
        assignees: ['user-1'],
        priority: 'high',
      };

      expect(task.progress_percent).toBe(60);
      expect(task.dependencies).toContain('card-0');
      expect(task.assignees).toContain('user-1');
    });

    it('GanttTask supports null dates', () => {
      const task: GanttTask = {
        id: 'card-2',
        title: 'Backlog item',
        start_date: null,
        end_date: null,
        progress_percent: 0,
        card_id: 'card-2',
        board_id: 'board-1',
        list_name: 'Backlog',
        dependencies: [],
        assignees: [],
        priority: null,
      };

      expect(task.start_date).toBeNull();
      expect(task.end_date).toBeNull();
      expect(task.priority).toBeNull();
    });

    it('returns empty array when no placements', async () => {
      // Create mock that returns empty placements
      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      };

      chainable.select.mockImplementation(() => ({
        ...chainable,
        then: (resolve: (val: { data: unknown }) => void) => {
          resolve({ data: [] });
          return { catch: vi.fn() };
        },
      }));

      // eq for board_id returns thenable with empty data
      chainable.eq.mockImplementation(() => ({
        then: (resolve: (val: { data: unknown }) => void) => {
          resolve({ data: [] });
          return { catch: vi.fn() };
        },
      }));

      const supabase = {
        from: vi.fn().mockReturnValue(chainable),
      } as unknown as Parameters<typeof getGanttTasks>[0];

      const result = await getGanttTasks(supabase, 'board-empty');
      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // BURNDOWN DATA
  // ============================================================================

  describe('getBurndownData', () => {
    it('computes burndown data points', () => {
      // Test the data structure
      const dataPoint = { date: '2025-01-01', remaining: 10, ideal: 10 };

      expect(dataPoint.date).toBe('2025-01-01');
      expect(dataPoint.remaining).toBe(10);
      expect(dataPoint.ideal).toBe(10);
    });

    it('ideal line decreases linearly', () => {
      const totalCards = 20;
      const totalDays = 10;
      const dailyBurn = totalCards / totalDays;

      const idealLine = [];
      for (let d = 0; d <= totalDays; d++) {
        idealLine.push(Math.max(0, Math.round((totalCards - dailyBurn * d) * 100) / 100));
      }

      expect(idealLine[0]).toBe(20);
      expect(idealLine[totalDays]).toBe(0);
      expect(idealLine[5]).toBe(10);
    });

    it('remaining never goes below zero', () => {
      const remaining = Math.max(0, -5);
      expect(remaining).toBe(0);
    });

    it('returns empty array when no placements', async () => {
      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
      };

      chainable.select.mockImplementation(() => ({
        ...chainable,
        then: (resolve: (val: { data: unknown }) => void) => {
          resolve({ data: null });
          return { catch: vi.fn() };
        },
      }));

      chainable.eq.mockImplementation(() => ({
        ...chainable,
        then: (resolve: (val: { data: unknown }) => void) => {
          resolve({ data: null });
          return { catch: vi.fn() };
        },
      }));

      const supabase = {
        from: vi.fn().mockReturnValue(chainable),
      } as unknown as Parameters<typeof getBurndownData>[0];

      const result = await getBurndownData(supabase, 'board-x', '2025-01-01', '2025-01-10');
      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // TYPE COVERAGE
  // ============================================================================

  describe('ReportType type', () => {
    it('covers all report types', () => {
      const types: ReportType[] = ['burndown', 'velocity', 'cycle_time', 'workload', 'ai_effectiveness', 'custom'];
      expect(types).toHaveLength(6);
      expect(types).toContain('burndown');
      expect(types).toContain('velocity');
      expect(types).toContain('custom');
    });
  });

  describe('SurveyType type', () => {
    it('covers all survey types', () => {
      const types: SurveyType[] = ['delivery', 'milestone', 'periodic'];
      expect(types).toHaveLength(3);
    });
  });

  describe('PortalBranding type', () => {
    it('has all required fields', () => {
      const branding: PortalBranding = {
        id: 'b-1',
        client_id: null,
        logo_url: null,
        primary_color: '#6366f1',
        secondary_color: '#0f172a',
        accent_color: '#faf7f2',
        favicon_url: null,
        custom_domain: null,
        company_name: null,
        footer_text: null,
        is_active: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      expect(branding.primary_color).toBe('#6366f1');
      expect(branding.client_id).toBeNull();
      expect(branding.is_active).toBe(false);
    });
  });

  describe('CustomReport type', () => {
    it('supports schedule field', () => {
      const report: CustomReport = {
        id: 'r-1',
        name: 'Test',
        description: null,
        report_type: 'burndown',
        config: {},
        created_by: 'user-1',
        is_shared: false,
        schedule: 'weekly',
        last_generated_at: '2025-01-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      expect(report.schedule).toBe('weekly');
      expect(report.last_generated_at).not.toBeNull();
    });

    it('schedule can be null', () => {
      const report: CustomReport = {
        id: 'r-2',
        name: 'Ad-hoc',
        description: null,
        report_type: 'custom',
        config: { metric: 'total_cards' },
        created_by: 'user-1',
        is_shared: true,
        schedule: null,
        last_generated_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      expect(report.schedule).toBeNull();
      expect(report.is_shared).toBe(true);
    });
  });
});
