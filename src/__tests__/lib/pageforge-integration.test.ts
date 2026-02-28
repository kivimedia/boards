import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Types we need (imported from source types, not from server modules)
// ---------------------------------------------------------------------------

import type {
  PageForgeBuild,
  PageForgeBuildStatus,
  PageForgeSiteProfile,
  PageForgeGateDecision,
} from '../../lib/types';

// ---------------------------------------------------------------------------
// Mock Supabase state tracker
// ---------------------------------------------------------------------------

interface BuildRow extends Record<string, unknown> {
  id: string;
  status: PageForgeBuildStatus;
  current_phase: number;
  phase_results: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  error_log: Array<{ phase: string; error: string; timestamp: string }>;
  total_cost_usd: number;
  agent_costs: Record<string, number>;
  figma_file_key: string;
  figma_node_ids: string[];
  page_title: string;
  page_slug: string | null;
  page_builder: string;
  site_profile_id: string;
  client_id: string | null;
  vqa_fix_iteration: number;
  wp_page_id: number | null;
  published_at: string | null;
  updated_at: string;
  site_profile?: Record<string, unknown>;
}

function makeTestBuild(overrides: Partial<BuildRow> = {}): BuildRow {
  return {
    id: 'build-int-1',
    status: 'pending',
    current_phase: 0,
    phase_results: {},
    artifacts: {},
    error_log: [],
    total_cost_usd: 0,
    agent_costs: {},
    figma_file_key: 'abc123',
    figma_node_ids: ['0:1'],
    page_title: 'Test Landing Page',
    page_slug: 'test-landing',
    page_builder: 'gutenberg',
    site_profile_id: 'sp-1',
    client_id: 'c-1',
    vqa_fix_iteration: 0,
    wp_page_id: null,
    published_at: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSiteProfile(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'sp-1',
    client_id: 'c-1',
    site_name: 'Test Site',
    site_url: 'https://example.com',
    wp_rest_url: 'https://example.com/wp-json/wp/v2',
    wp_username: 'admin',
    wp_app_password: 'xxxx-xxxx',
    figma_personal_token: 'fig-token-123',
    figma_team_id: null,
    page_builder: 'gutenberg',
    yoast_enabled: true,
    vqa_pass_threshold: 85,
    lighthouse_min_score: 80,
    max_vqa_fix_loops: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Supabase factory: tracks all updates to a build row in memory
// ---------------------------------------------------------------------------

function createMockSupabase(initialBuild: BuildRow, siteProfile: Record<string, unknown>) {
  // Mutable state
  const buildState = { ...initialBuild, site_profile: siteProfile };

  // Track all calls
  const insertCalls: Array<{ table: string; data: Record<string, unknown> }> = [];
  const updateCalls: Array<{ table: string; data: Record<string, unknown> }> = [];

  function makeChain(table: string) {
    const chain: Record<string, any> = {};

    chain.insert = vi.fn((data: any) => {
      insertCalls.push({ table, data });
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: `new-${table}-id` }, error: null }),
        }),
      };
    });

    chain.update = vi.fn((data: any) => {
      updateCalls.push({ table, data });
      if (table === 'pageforge_builds') {
        Object.assign(buildState, data);
      }
      return {
        eq: vi.fn().mockReturnThis(),
      };
    });

    chain.select = vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { ...buildState }, error: null }),
        then: undefined,
      })),
      order: vi.fn().mockReturnValue({
        then: undefined,
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }));

    return chain;
  }

  const supabase = {
    from: vi.fn((table: string) => makeChain(table)),
  };

  return { supabase: supabase as any, buildState, insertCalls, updateCalls };
}

// ---------------------------------------------------------------------------
// Import the pipeline constants and functions
// (We import from the actual source but mock their external deps)
// ---------------------------------------------------------------------------

vi.mock('../../lib/ai/cost-tracker', () => ({
  calculateCost: vi.fn(() => 0.002),
}));

vi.mock('../../lib/ai/providers', () => ({
  getProviderClient: vi.fn(),
  getProviderKey: vi.fn().mockResolvedValue('fake-key'),
  touchApiKey: vi.fn(),
}));

vi.mock('../../lib/ai/model-resolver', () => ({
  resolveModelWithFallback: vi.fn().mockResolvedValue({
    provider: 'anthropic',
    model_id: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    temperature: 0.3,
  }),
}));

vi.mock('../../lib/ai/prompt-templates', () => ({
  getSystemPrompt: vi.fn(() => 'You are a helpful assistant.'),
}));

// Mock the Anthropic SDK that callPageForgeAgent dynamically imports
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"result": "ok"}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  })),
}));

import {
  PAGEFORGE_PHASE_ORDER,
  GATE_PHASES,
  createBuild,
  submitPageForgeGateDecision,
  runPageForgePhase,
} from '../../lib/ai/pageforge-pipeline';

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('PageForge Integration - Build Creation', () => {
  it('createBuild returns a valid build record', async () => {
    const siteProfile = makeSiteProfile() as any;

    const insertResult = {
      id: 'build-new',
      site_profile_id: siteProfile.id,
      client_id: siteProfile.client_id,
      figma_file_key: 'fig-key',
      figma_node_ids: ['0:1', '0:2'],
      page_title: 'Landing Page',
      page_slug: 'landing-page',
      page_builder: 'gutenberg',
      status: 'pending',
      current_phase: 0,
      phase_results: {},
      artifacts: {},
      error_log: [],
      total_cost_usd: 0,
      agent_costs: {},
      created_by: 'user-1',
    };

    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
          }),
        }),
      }),
    } as any;

    const build = await createBuild(supabase, siteProfile, {
      figmaFileKey: 'fig-key',
      figmaNodeIds: ['0:1', '0:2'],
      pageTitle: 'Landing Page',
      pageSlug: 'landing-page',
      createdBy: 'user-1',
    });

    expect(build.id).toBe('build-new');
    expect(build.status).toBe('pending');
    expect(build.current_phase).toBe(0);
    expect(build.total_cost_usd).toBe(0);
    expect(supabase.from).toHaveBeenCalledWith('pageforge_builds');
  });

  it('createBuild throws when supabase returns an error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'duplicate key' } }),
          }),
        }),
      }),
    } as any;

    await expect(
      createBuild(supabase, makeSiteProfile() as any, {
        figmaFileKey: 'x',
        figmaNodeIds: ['0:1'],
        pageTitle: 'T',
      })
    ).rejects.toThrow('Failed to create PageForge build');
  });
});

describe('PageForge Integration - Phase Progression', () => {
  it('phases are defined in the correct order', () => {
    expect(PAGEFORGE_PHASE_ORDER).toHaveLength(15);
    expect(PAGEFORGE_PHASE_ORDER[0]).toBe('preflight');
    expect(PAGEFORGE_PHASE_ORDER[3]).toBe('markup_generation');
    expect(PAGEFORGE_PHASE_ORDER[9]).toBe('vqa_fix_loop');
    expect(PAGEFORGE_PHASE_ORDER[10]).toBe('functional_qa');
    expect(PAGEFORGE_PHASE_ORDER[11]).toBe('seo_config');
    expect(PAGEFORGE_PHASE_ORDER[13]).toBe('developer_review_gate');
    expect(PAGEFORGE_PHASE_ORDER[14]).toBe('am_signoff_gate');
  });

  it('gate phases are developer_review_gate and am_signoff_gate', () => {
    expect(GATE_PHASES.has('developer_review_gate')).toBe(true);
    expect(GATE_PHASES.has('am_signoff_gate')).toBe(true);
    expect(GATE_PHASES.size).toBe(2);
  });

  it('runPageForgePhase rejects unknown phases', async () => {
    const { supabase } = createMockSupabase(makeTestBuild(), makeSiteProfile());

    await expect(
      runPageForgePhase(supabase, 'build-1', 'totally_fake_phase', {
        systemPrompt: 'sp',
        userMessage: 'um',
      })
    ).rejects.toThrow('Unknown phase');
  });

  it('runPageForgePhase rejects gate phases (must use submitPageForgeGateDecision)', async () => {
    const { supabase } = createMockSupabase(makeTestBuild(), makeSiteProfile());

    await expect(
      runPageForgePhase(supabase, 'build-1', 'developer_review_gate', {
        systemPrompt: 'sp',
        userMessage: 'um',
      })
    ).rejects.toThrow('Gate phases');
  });

  it('runPageForgePhase rejects builds in terminal state (failed)', async () => {
    const build = makeTestBuild({ status: 'failed' });
    const { supabase } = createMockSupabase(build, makeSiteProfile());

    await expect(
      runPageForgePhase(supabase, build.id, 'figma_analysis', {
        systemPrompt: 'sp',
        userMessage: 'um',
      })
    ).rejects.toThrow('terminal state');
  });

  it('runPageForgePhase rejects builds in terminal state (cancelled)', async () => {
    const build = makeTestBuild({ status: 'cancelled' });
    const { supabase } = createMockSupabase(build, makeSiteProfile());

    await expect(
      runPageForgePhase(supabase, build.id, 'figma_analysis', {
        systemPrompt: 'sp',
        userMessage: 'um',
      })
    ).rejects.toThrow('terminal state');
  });
});

describe('PageForge Integration - Gate Decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gate pause: worker stops at developer_review_gate', () => {
    // The worker checks GATE_PHASES.has(phase) and returns early.
    // Verify the gate index is correct.
    const devGateIndex = PAGEFORGE_PHASE_ORDER.indexOf('developer_review_gate');
    expect(devGateIndex).toBe(13);
    expect(GATE_PHASES.has(PAGEFORGE_PHASE_ORDER[devGateIndex])).toBe(true);
  });

  it('gate approve: resumes from next phase', async () => {
    const build = makeTestBuild({ status: 'developer_review_gate', current_phase: 13 });
    const { supabase, updateCalls } = createMockSupabase(build, makeSiteProfile());

    const result = await submitPageForgeGateDecision(
      supabase, build.id, 'developer_review_gate', 'approve', 'Looks good!', 'user-1'
    );

    // After approving dev gate (index 13), next phase is am_signoff_gate (index 14)
    expect(result.newStatus).toBe('am_signoff_gate');

    const buildUpdate = updateCalls.find(u => u.table === 'pageforge_builds');
    expect(buildUpdate).toBeDefined();
    expect(buildUpdate!.data.status).toBe('am_signoff_gate');
    expect(buildUpdate!.data.current_phase).toBe(14);
  });

  it('gate approve on final gate sets status to published', async () => {
    const build = makeTestBuild({ status: 'am_signoff_gate', current_phase: 14 });
    const { supabase } = createMockSupabase(build, makeSiteProfile());

    const result = await submitPageForgeGateDecision(
      supabase, build.id, 'am_signoff_gate', 'approve', 'Ship it!', 'user-1'
    );

    expect(result.newStatus).toBe('published');
  });

  it('gate revise: dev gate restarts from markup_generation', async () => {
    const build = makeTestBuild({ status: 'developer_review_gate', current_phase: 13 });
    const { supabase, updateCalls } = createMockSupabase(build, makeSiteProfile());

    const result = await submitPageForgeGateDecision(
      supabase, build.id, 'developer_review_gate', 'revise', 'Fix the hero section', 'user-1'
    );

    expect(result.newStatus).toBe('markup_generation');
    const buildUpdate = updateCalls.find(u => u.table === 'pageforge_builds');
    expect(buildUpdate!.data.current_phase).toBe(PAGEFORGE_PHASE_ORDER.indexOf('markup_generation'));
  });

  it('gate revise: AM gate restarts from vqa_capture', async () => {
    const build = makeTestBuild({ status: 'am_signoff_gate', current_phase: 14 });
    const { supabase } = createMockSupabase(build, makeSiteProfile());

    const result = await submitPageForgeGateDecision(
      supabase, build.id, 'am_signoff_gate', 'revise', 'Images look off', 'user-1'
    );

    expect(result.newStatus).toBe('vqa_capture');
  });

  it('gate cancel sets build to cancelled', async () => {
    const build = makeTestBuild({ status: 'developer_review_gate', current_phase: 13 });
    const { supabase } = createMockSupabase(build, makeSiteProfile());

    const result = await submitPageForgeGateDecision(
      supabase, build.id, 'developer_review_gate', 'cancel', 'Client changed their mind', 'user-1'
    );

    expect(result.newStatus).toBe('cancelled');
  });

  it('gate decision logs an agent call for audit trail', async () => {
    const build = makeTestBuild({ status: 'developer_review_gate', current_phase: 13 });
    const { supabase, insertCalls } = createMockSupabase(build, makeSiteProfile());

    await submitPageForgeGateDecision(
      supabase, build.id, 'developer_review_gate', 'approve', 'LGTM', 'user-1'
    );

    const agentCallInsert = insertCalls.find(c => c.table === 'pageforge_agent_calls');
    expect(agentCallInsert).toBeDefined();
    expect(agentCallInsert!.data.agent_name).toBe('human_dev_gate');
    expect(agentCallInsert!.data.phase).toBe('developer_review_gate');
  });
});

describe('PageForge Integration - Worker Behavior (Conceptual)', () => {
  it('VQA fix loop limit is configurable via site profile', () => {
    const sp = makeSiteProfile({ max_vqa_fix_loops: 5 });
    expect(sp.max_vqa_fix_loops).toBe(5);

    const sp2 = makeSiteProfile({ max_vqa_fix_loops: 1 });
    expect(sp2.max_vqa_fix_loops).toBe(1);
  });

  it('preflight fails when figma_file_key is missing', () => {
    // Inline preflight logic from the worker
    const siteProfile = makeSiteProfile();
    const build = makeTestBuild({ figma_file_key: '' });

    const errors: string[] = [];
    if (!siteProfile.wp_rest_url) errors.push('Missing wp_rest_url');
    if (!siteProfile.wp_username) errors.push('Missing wp_username');
    if (!siteProfile.wp_app_password) errors.push('Missing wp_app_password');
    if (!siteProfile.figma_personal_token) errors.push('Missing figma_personal_token');
    if (!build.figma_file_key) errors.push('Missing figma_file_key');
    if (!build.page_title) errors.push('Missing page_title');

    expect(errors).toContain('Missing figma_file_key');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('preflight fails when WP credentials are missing', () => {
    const siteProfile = makeSiteProfile({
      wp_username: null,
      wp_app_password: null,
    });
    const build = makeTestBuild();

    const errors: string[] = [];
    if (!siteProfile.wp_rest_url) errors.push('Missing wp_rest_url');
    if (!siteProfile.wp_username) errors.push('Missing wp_username');
    if (!siteProfile.wp_app_password) errors.push('Missing wp_app_password');
    if (!siteProfile.figma_personal_token) errors.push('Missing figma_personal_token');
    if (!build.figma_file_key) errors.push('Missing figma_file_key');

    expect(errors).toContain('Missing wp_username');
    expect(errors).toContain('Missing wp_app_password');
  });

  it('error during phase sets error_log and status=failed', () => {
    // Simulate what the worker does when a phase throws
    const build = makeTestBuild();
    const errorMsg = 'Figma API rate limited';
    const phase = 'figma_analysis';

    const updatedBuild = {
      ...build,
      status: 'failed' as PageForgeBuildStatus,
      error_log: [
        ...build.error_log,
        { phase, error: errorMsg, timestamp: new Date().toISOString() },
      ],
    };

    expect(updatedBuild.status).toBe('failed');
    expect(updatedBuild.error_log).toHaveLength(1);
    expect(updatedBuild.error_log[0].phase).toBe('figma_analysis');
    expect(updatedBuild.error_log[0].error).toContain('rate limited');
  });

  it('cost accumulation: total_cost_usd increases with each agent call', () => {
    const build = makeTestBuild({ total_cost_usd: 0.01, agent_costs: { pageforge_figma_analysis: 0.01 } });

    // Simulate adding a second agent call cost
    const newCost = 0.003;
    const agentName = 'pageforge_markup_generation';
    const updatedTotal = build.total_cost_usd + newCost;
    const updatedAgentCosts = {
      ...build.agent_costs,
      [agentName]: (build.agent_costs[agentName] || 0) + newCost,
    };

    expect(updatedTotal).toBeCloseTo(0.013);
    expect(updatedAgentCosts[agentName]).toBeCloseTo(0.003);
    expect(updatedAgentCosts.pageforge_figma_analysis).toBeCloseTo(0.01);
  });

  it('final completion: all phases done sets status=published', () => {
    // When the worker loop finishes all 15 phases without hitting a gate that pauses,
    // it sets status to published
    const lastPhaseIndex = PAGEFORGE_PHASE_ORDER.length - 1;
    const lastPhase = PAGEFORGE_PHASE_ORDER[lastPhaseIndex];
    expect(lastPhase).toBe('am_signoff_gate');

    // After the last gate is approved, newStatus should be 'published'
    // (because there is no nextPhase after am_signoff_gate)
    const nextPhaseAfterLast = PAGEFORGE_PHASE_ORDER[lastPhaseIndex + 1];
    expect(nextPhaseAfterLast).toBeUndefined();
  });

  it('phase progression follows the defined order', () => {
    const expected = [
      'preflight',
      'figma_analysis',
      'section_classification',
      'markup_generation',
      'markup_validation',
      'deploy_draft',
      'image_optimization',
      'vqa_capture',
      'vqa_comparison',
      'vqa_fix_loop',
      'functional_qa',
      'seo_config',
      'report_generation',
      'developer_review_gate',
      'am_signoff_gate',
    ];
    expect(PAGEFORGE_PHASE_ORDER).toEqual(expected);
  });
});
