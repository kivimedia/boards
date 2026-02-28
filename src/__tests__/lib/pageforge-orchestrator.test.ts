import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function chainable(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, any> = {
    from: vi.fn(() => chain),
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => ({ data: null, error: null })),
    ...overrides,
  };
  return chain;
}

let mockSupabase: ReturnType<typeof chainable>;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockWpTestConnection = vi.fn();
const mockCreateWpClient = vi.fn(() => ({ baseUrl: 'https://example.com/wp-json' }));
const mockWpIsPluginActive = vi.fn();

vi.mock('@/lib/integrations/wordpress-client', () => ({
  wpTestConnection: (...args: any[]) => mockWpTestConnection(...args),
  createWpClient: (...args: any[]) => mockCreateWpClient(...args),
  wpIsPluginActive: (...args: any[]) => mockWpIsPluginActive(...args),
}));

const mockWpCliTestConnection = vi.fn();

vi.mock('@/lib/integrations/wp-cli-client', () => ({
  wpCliTestConnection: (...args: any[]) => mockWpCliTestConnection(...args),
}));

const mockFigmaTestConnection = vi.fn();

vi.mock('@/lib/integrations/figma-client', () => ({
  figmaTestConnection: (...args: any[]) => mockFigmaTestConnection(...args),
}));

const mockCallPageForgeAgent = vi.fn(async () => ({
  text: 'Final report content here',
  inputTokens: 500,
  outputTokens: 300,
  costUsd: 0.012,
  durationMs: 3000,
  model: 'claude-sonnet-4-5-20250929',
  provider: 'anthropic',
}));

vi.mock('@/lib/ai/pageforge-pipeline', () => ({
  callPageForgeAgent: (...args: any[]) => mockCallPageForgeAgent(...args),
}));

vi.mock('@/lib/ai/prompt-templates', () => ({
  getSystemPrompt: vi.fn(() => 'You are the orchestrator.'),
}));

// ---------------------------------------------------------------------------
// Import under test (AFTER mocks)
// ---------------------------------------------------------------------------

import {
  runPreflight,
  compileFinalReport,
  calculateBuildCost,
} from '@/lib/ai/pageforge/orchestrator';
import type { PreflightResult } from '@/lib/ai/pageforge/orchestrator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSiteProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sp-1',
    client_id: 'client-1',
    site_name: 'Test Site',
    site_url: 'https://example.com',
    wp_rest_url: 'https://example.com/wp-json',
    wp_username: 'admin',
    wp_app_password: 'xxxx',
    wp_ssh_host: null,
    wp_ssh_user: null,
    wp_ssh_key_path: null,
    figma_personal_token: 'figma-token-abc',
    figma_team_id: null,
    page_builder: 'gutenberg',
    theme_name: null,
    theme_css_url: null,
    global_css: null,
    yoast_enabled: false,
    vqa_pass_threshold: 85,
    lighthouse_min_score: 80,
    max_vqa_fix_loops: 3,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBuild(overrides: Record<string, unknown> = {}) {
  return {
    id: 'build-1',
    site_profile_id: 'sp-1',
    client_id: 'client-1',
    figma_file_key: 'abc123',
    figma_node_ids: ['0:1'],
    page_title: 'Landing Page',
    page_slug: 'landing',
    page_builder: 'gutenberg',
    status: 'report_generation',
    current_phase: 12,
    phase_results: { preflight: 'ok', figma_analysis: 'parsed' },
    artifacts: {},
    error_log: [],
    total_cost_usd: 0.05,
    agent_costs: { pageforge_builder: 0.03, pageforge_vqa: 0.02 },
    vqa_score_desktop: 92,
    vqa_score_tablet: 88,
    vqa_score_mobile: 85,
    vqa_score_overall: 88,
    lighthouse_performance: 95,
    lighthouse_accessibility: 100,
    lighthouse_best_practices: 92,
    lighthouse_seo: 100,
    qa_checks_passed: 18,
    qa_checks_failed: 2,
    qa_checks_total: 20,
    vqa_fix_iteration: 2,
    wp_draft_url: 'https://example.com/?p=123&preview=true',
    wp_preview_url: 'https://example.com/?p=123&preview=true',
    wp_live_url: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T12:00:00Z',
    published_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PageForge Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = chainable();
  });

  // =========================================================================
  // runPreflight
  // =========================================================================

  describe('runPreflight', () => {
    it('passes when WP REST responds OK and Figma token is valid', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: true, siteName: 'Example Site' });
      mockFigmaTestConnection.mockResolvedValue({ ok: true, email: 'designer@test.com' });
      mockWpIsPluginActive.mockResolvedValue(false); // Gutenberg is built-in

      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile() as any
      );

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns structured result with checks array', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: true, siteName: 'Site' });
      mockFigmaTestConnection.mockResolvedValue({ ok: true, email: 'a@b.com' });

      const result: PreflightResult = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile() as any
      );

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.checks)).toBe(true);
    });

    it('each check has name, passed, and message fields', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: true, siteName: 'Site' });
      mockFigmaTestConnection.mockResolvedValue({ ok: true, email: 'a@b.com' });

      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile() as any
      );

      for (const check of result.checks) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('passed');
        expect(check).toHaveProperty('message');
      }
    });

    it('fails when WP connection fails', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: false, error: 'Connection refused' });
      mockFigmaTestConnection.mockResolvedValue({ ok: true, email: 'a@b.com' });

      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile() as any
      );

      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('WP REST'))).toBe(true);
    });

    it('fails when WP credentials are not configured', async () => {
      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile({ wp_username: null, wp_app_password: null }) as any
      );

      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('WordPress credentials not configured'))).toBe(true);
    });

    it('fails when Figma token is invalid', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: true, siteName: 'Site' });
      mockFigmaTestConnection.mockResolvedValue({ ok: false, error: 'Invalid token' });

      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile() as any
      );

      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('Figma'))).toBe(true);
    });

    it('fails when Figma token is not configured', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: true, siteName: 'Site' });

      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile({ figma_personal_token: null }) as any
      );

      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.includes('Figma personal access token not configured'))).toBe(true);
    });

    it('checks page builder plugin for divi5', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: true, siteName: 'Site' });
      mockFigmaTestConnection.mockResolvedValue({ ok: true, email: 'a@b.com' });
      mockWpIsPluginActive.mockResolvedValue(false);

      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile({ page_builder: 'divi5' }) as any
      );

      // Check that there is a page builder check for divi5
      const builderCheck = result.checks.find(c => c.name.includes('divi5'));
      expect(builderCheck).toBeDefined();
    });

    it('marks Gutenberg as always available', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: true, siteName: 'Site' });
      mockFigmaTestConnection.mockResolvedValue({ ok: true, email: 'a@b.com' });

      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile({ page_builder: 'gutenberg' }) as any
      );

      const builderCheck = result.checks.find(c => c.name.includes('Gutenberg'));
      expect(builderCheck).toBeDefined();
      expect(builderCheck!.passed).toBe(true);
    });

    it('includes SSH check when wp_ssh_host is configured', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: true, siteName: 'Site' });
      mockFigmaTestConnection.mockResolvedValue({ ok: true, email: 'a@b.com' });
      mockWpCliTestConnection.mockResolvedValue({ ok: true, wpCliVersion: '2.9.0' });

      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile({ wp_ssh_host: '10.0.0.1', wp_ssh_user: 'deploy' }) as any
      );

      const sshCheck = result.checks.find(c => c.name.includes('SSH'));
      expect(sshCheck).toBeDefined();
      expect(sshCheck!.passed).toBe(true);
    });

    it('does not fail overall when SSH check fails (SSH is optional)', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: true, siteName: 'Site' });
      mockFigmaTestConnection.mockResolvedValue({ ok: true, email: 'a@b.com' });
      mockWpCliTestConnection.mockResolvedValue({ ok: false, error: 'SSH timeout' });

      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile({ wp_ssh_host: '10.0.0.1', wp_ssh_user: 'deploy' }) as any
      );

      // SSH failure should not block the build since it's optional
      expect(result.passed).toBe(true);
    });

    it('skips SSH check when wp_ssh_host is not set', async () => {
      mockWpTestConnection.mockResolvedValue({ ok: true, siteName: 'Site' });
      mockFigmaTestConnection.mockResolvedValue({ ok: true, email: 'a@b.com' });

      const result = await runPreflight(
        mockSupabase as any,
        'build-1',
        makeSiteProfile({ wp_ssh_host: null }) as any
      );

      const sshCheck = result.checks.find(c => c.name.includes('SSH'));
      expect(sshCheck).toBeUndefined();
    });
  });

  // =========================================================================
  // compileFinalReport
  // =========================================================================

  describe('compileFinalReport', () => {
    it('calls callPageForgeAgent with report_generation phase', async () => {
      const build = makeBuild();
      const calls: any[] = [];

      const report = await compileFinalReport(
        mockSupabase as any,
        'build-1',
        build as any,
        calls
      );

      expect(mockCallPageForgeAgent).toHaveBeenCalledWith(
        expect.anything(),
        'build-1',
        'pageforge_report',
        'report_generation',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ activity: 'pageforge_orchestrator' })
      );
    });

    it('returns the text from the agent response', async () => {
      mockCallPageForgeAgent.mockResolvedValueOnce({
        text: 'Build completed successfully. All VQA scores above 85%.',
        inputTokens: 400,
        outputTokens: 200,
        costUsd: 0.008,
        durationMs: 2000,
        model: 'claude-sonnet-4-5-20250929',
        provider: 'anthropic',
      });

      const report = await compileFinalReport(
        mockSupabase as any,
        'build-1',
        makeBuild() as any,
        []
      );

      expect(report).toBe('Build completed successfully. All VQA scores above 85%.');
    });

    it('includes build page title in the prompt', async () => {
      await compileFinalReport(
        mockSupabase as any,
        'build-1',
        makeBuild({ page_title: 'About Us Page' }) as any,
        []
      );

      const userMessage = mockCallPageForgeAgent.mock.calls[0][5];
      expect(userMessage).toContain('About Us Page');
    });

    it('includes VQA scores in the prompt', async () => {
      await compileFinalReport(
        mockSupabase as any,
        'build-1',
        makeBuild({ vqa_score_overall: 91 }) as any,
        []
      );

      const userMessage = mockCallPageForgeAgent.mock.calls[0][5];
      expect(userMessage).toContain('91');
    });
  });

  // =========================================================================
  // calculateBuildCost
  // =========================================================================

  describe('calculateBuildCost', () => {
    it('sums agent_calls costs correctly', () => {
      const calls = [
        { agent_name: 'builder', phase: 'figma_analysis', cost_usd: 0.005 },
        { agent_name: 'builder', phase: 'markup_generation', cost_usd: 0.003 },
        { agent_name: 'vqa', phase: 'vqa_comparison', cost_usd: 0.004 },
      ] as any[];

      const result = calculateBuildCost(calls);
      expect(result.totalCost).toBeCloseTo(0.012);
    });

    it('groups costs by agent name (byCost)', () => {
      const calls = [
        { agent_name: 'builder', phase: 'figma_analysis', cost_usd: 0.005 },
        { agent_name: 'builder', phase: 'markup_generation', cost_usd: 0.003 },
        { agent_name: 'vqa_agent', phase: 'vqa_comparison', cost_usd: 0.004 },
      ] as any[];

      const result = calculateBuildCost(calls);
      expect(result.byCost['builder']).toBeCloseTo(0.008);
      expect(result.byCost['vqa_agent']).toBeCloseTo(0.004);
    });

    it('groups costs by phase (byPhase)', () => {
      const calls = [
        { agent_name: 'builder', phase: 'figma_analysis', cost_usd: 0.005 },
        { agent_name: 'builder', phase: 'figma_analysis', cost_usd: 0.002 },
        { agent_name: 'vqa_agent', phase: 'vqa_comparison', cost_usd: 0.004 },
      ] as any[];

      const result = calculateBuildCost(calls);
      expect(result.byPhase['figma_analysis']).toBeCloseTo(0.007);
      expect(result.byPhase['vqa_comparison']).toBeCloseTo(0.004);
    });

    it('handles empty calls array', () => {
      const result = calculateBuildCost([]);
      expect(result.totalCost).toBe(0);
      expect(result.byCost).toEqual({});
      expect(result.byPhase).toEqual({});
    });

    it('handles calls with zero cost', () => {
      const calls = [
        { agent_name: 'human_dev_gate', phase: 'developer_review_gate', cost_usd: 0 },
        { agent_name: 'human_am_gate', phase: 'am_signoff_gate', cost_usd: 0 },
      ] as any[];

      const result = calculateBuildCost(calls);
      expect(result.totalCost).toBe(0);
    });

    it('handles single call', () => {
      const calls = [
        { agent_name: 'builder', phase: 'preflight', cost_usd: 0.001 },
      ] as any[];

      const result = calculateBuildCost(calls);
      expect(result.totalCost).toBeCloseTo(0.001);
      expect(Object.keys(result.byCost)).toHaveLength(1);
      expect(Object.keys(result.byPhase)).toHaveLength(1);
    });

    it('treats null/undefined cost_usd as 0', () => {
      const calls = [
        { agent_name: 'builder', phase: 'preflight', cost_usd: null },
        { agent_name: 'builder', phase: 'figma_analysis', cost_usd: undefined },
        { agent_name: 'builder', phase: 'markup_generation', cost_usd: 0.003 },
      ] as any[];

      const result = calculateBuildCost(calls);
      expect(result.totalCost).toBeCloseTo(0.003);
    });
  });
});
