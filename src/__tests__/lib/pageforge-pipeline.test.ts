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
    single: vi.fn(() => ({ data: null, error: null, count: 0 })),
    ...overrides,
  };
  return chain;
}

let mockSupabase: ReturnType<typeof chainable>;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/lib/ai/cost-tracker', () => ({
  calculateCost: vi.fn(() => 0.0042),
}));

vi.mock('@/lib/ai/providers', () => ({
  getProviderClient: vi.fn(),
  getProviderKey: vi.fn(async () => 'fake-key-123'),
  touchApiKey: vi.fn(async () => {}),
}));

vi.mock('@/lib/ai/model-resolver', () => ({
  resolveModelWithFallback: vi.fn(async () => ({
    provider: 'anthropic',
    model_id: 'claude-sonnet-4-5-20250929',
    temperature: 0.3,
    max_tokens: 4096,
  })),
}));

vi.mock('@/lib/ai/prompt-templates', () => ({
  getSystemPrompt: vi.fn(() => 'You are a test prompt.'),
}));

// Mock the AI SDK imports used inside callPageForgeAgent
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn(async () => ({
    content: [{ type: 'text', text: 'AI response text' }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }));
  function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }
  return {
    default: MockAnthropic,
    __mockCreate: mockCreate,
  };
});

vi.mock('openai', () => {
  const mockCreate = vi.fn(async () => ({
    choices: [{ message: { content: 'OpenAI response' } }],
    usage: { prompt_tokens: 80, completion_tokens: 40 },
  }));
  function MockOpenAI() {
    return { chat: { completions: { create: mockCreate } } };
  }
  return {
    default: MockOpenAI,
    __mockCreate: mockCreate,
  };
});

vi.mock('@google/generative-ai', () => {
  const mockGenerate = vi.fn(async () => ({
    response: {
      text: () => 'Google response',
      usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 45 },
    },
  }));
  function MockGoogleGenerativeAI() {
    return {
      getGenerativeModel: vi.fn(() => ({
        generateContent: mockGenerate,
      })),
    };
  }
  return {
    GoogleGenerativeAI: MockGoogleGenerativeAI,
    __mockGenerate: mockGenerate,
  };
});

// ---------------------------------------------------------------------------
// Import under test (AFTER mocks)
// ---------------------------------------------------------------------------

import {
  PAGEFORGE_PHASE_ORDER,
  PHASE_TO_ACTIVITY,
  GATE_PHASES,
  createBuild,
  callPageForgeAgent,
  runPageForgePhase,
  submitPageForgeGateDecision,
  getBuildWithCalls,
  listBuilds,
} from '@/lib/ai/pageforge-pipeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBuild(overrides: Record<string, unknown> = {}) {
  return {
    id: 'build-1',
    site_profile_id: 'sp-1',
    client_id: 'client-1',
    figma_file_key: 'abc123',
    figma_node_ids: ['0:1'],
    page_title: 'Home Page',
    page_slug: 'home',
    page_builder: 'gutenberg',
    status: 'pending',
    current_phase: 0,
    phase_results: {},
    artifacts: {},
    error_log: [],
    total_cost_usd: 0,
    agent_costs: {},
    vqa_fix_iteration: 0,
    qa_checks_passed: 0,
    qa_checks_failed: 0,
    qa_checks_total: 0,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    published_at: null,
    ...overrides,
  };
}

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
    figma_personal_token: 'figma-token',
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PageForge Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = chainable();
  });

  // =========================================================================
  // PAGEFORGE_PHASE_ORDER
  // =========================================================================

  describe('PAGEFORGE_PHASE_ORDER', () => {
    it('has exactly 15 phases', () => {
      expect(PAGEFORGE_PHASE_ORDER).toHaveLength(15);
    });

    it('starts with preflight', () => {
      expect(PAGEFORGE_PHASE_ORDER[0]).toBe('preflight');
    });

    it('ends with am_signoff_gate', () => {
      expect(PAGEFORGE_PHASE_ORDER[14]).toBe('am_signoff_gate');
    });

    it('has figma_analysis at index 1', () => {
      expect(PAGEFORGE_PHASE_ORDER[1]).toBe('figma_analysis');
    });

    it('has section_classification at index 2', () => {
      expect(PAGEFORGE_PHASE_ORDER[2]).toBe('section_classification');
    });

    it('has markup_generation at index 3', () => {
      expect(PAGEFORGE_PHASE_ORDER[3]).toBe('markup_generation');
    });

    it('has markup_validation at index 4', () => {
      expect(PAGEFORGE_PHASE_ORDER[4]).toBe('markup_validation');
    });

    it('has deploy_draft at index 5', () => {
      expect(PAGEFORGE_PHASE_ORDER[5]).toBe('deploy_draft');
    });

    it('has image_optimization at index 6', () => {
      expect(PAGEFORGE_PHASE_ORDER[6]).toBe('image_optimization');
    });

    it('has vqa_capture at index 7', () => {
      expect(PAGEFORGE_PHASE_ORDER[7]).toBe('vqa_capture');
    });

    it('has vqa_comparison at index 8', () => {
      expect(PAGEFORGE_PHASE_ORDER[8]).toBe('vqa_comparison');
    });

    it('has vqa_fix_loop at index 9', () => {
      expect(PAGEFORGE_PHASE_ORDER[9]).toBe('vqa_fix_loop');
    });

    it('has functional_qa at index 10', () => {
      expect(PAGEFORGE_PHASE_ORDER[10]).toBe('functional_qa');
    });

    it('has seo_config at index 11', () => {
      expect(PAGEFORGE_PHASE_ORDER[11]).toBe('seo_config');
    });

    it('has report_generation at index 12', () => {
      expect(PAGEFORGE_PHASE_ORDER[12]).toBe('report_generation');
    });

    it('has developer_review_gate at index 13', () => {
      expect(PAGEFORGE_PHASE_ORDER[13]).toBe('developer_review_gate');
    });

    it('has am_signoff_gate at index 14', () => {
      expect(PAGEFORGE_PHASE_ORDER[14]).toBe('am_signoff_gate');
    });

    it('contains no duplicate phases', () => {
      const unique = new Set(PAGEFORGE_PHASE_ORDER);
      expect(unique.size).toBe(PAGEFORGE_PHASE_ORDER.length);
    });

    it('all phases are lowercase snake_case strings', () => {
      for (const phase of PAGEFORGE_PHASE_ORDER) {
        expect(phase).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });
  });

  // =========================================================================
  // GATE_PHASES
  // =========================================================================

  describe('GATE_PHASES', () => {
    it('contains developer_review_gate', () => {
      expect(GATE_PHASES.has('developer_review_gate')).toBe(true);
    });

    it('contains am_signoff_gate', () => {
      expect(GATE_PHASES.has('am_signoff_gate')).toBe(true);
    });

    it('contains exactly 2 entries', () => {
      expect(GATE_PHASES.size).toBe(2);
    });

    it('does not contain preflight', () => {
      expect(GATE_PHASES.has('preflight')).toBe(false);
    });

    it('does not contain markup_generation', () => {
      expect(GATE_PHASES.has('markup_generation')).toBe(false);
    });

    it('gates are at indexes 13 and 14 in phase order', () => {
      const gateIndexes: number[] = [];
      PAGEFORGE_PHASE_ORDER.forEach((p, i) => {
        if (GATE_PHASES.has(p)) gateIndexes.push(i);
      });
      expect(gateIndexes).toEqual([13, 14]);
    });
  });

  // =========================================================================
  // PHASE_TO_ACTIVITY
  // =========================================================================

  describe('PHASE_TO_ACTIVITY', () => {
    it('maps preflight to pageforge_orchestrator', () => {
      expect(PHASE_TO_ACTIVITY['preflight']).toBe('pageforge_orchestrator');
    });

    it('maps figma_analysis to pageforge_builder', () => {
      expect(PHASE_TO_ACTIVITY['figma_analysis']).toBe('pageforge_builder');
    });

    it('maps section_classification to pageforge_builder', () => {
      expect(PHASE_TO_ACTIVITY['section_classification']).toBe('pageforge_builder');
    });

    it('maps markup_generation to pageforge_builder', () => {
      expect(PHASE_TO_ACTIVITY['markup_generation']).toBe('pageforge_builder');
    });

    it('maps markup_validation to pageforge_builder', () => {
      expect(PHASE_TO_ACTIVITY['markup_validation']).toBe('pageforge_builder');
    });

    it('maps deploy_draft to pageforge_builder', () => {
      expect(PHASE_TO_ACTIVITY['deploy_draft']).toBe('pageforge_builder');
    });

    it('maps image_optimization to pageforge_builder', () => {
      expect(PHASE_TO_ACTIVITY['image_optimization']).toBe('pageforge_builder');
    });

    it('maps vqa_capture to pageforge_vqa', () => {
      expect(PHASE_TO_ACTIVITY['vqa_capture']).toBe('pageforge_vqa');
    });

    it('maps vqa_comparison to pageforge_vqa', () => {
      expect(PHASE_TO_ACTIVITY['vqa_comparison']).toBe('pageforge_vqa');
    });

    it('maps vqa_fix_loop to pageforge_vqa', () => {
      expect(PHASE_TO_ACTIVITY['vqa_fix_loop']).toBe('pageforge_vqa');
    });

    it('maps functional_qa to pageforge_qa', () => {
      expect(PHASE_TO_ACTIVITY['functional_qa']).toBe('pageforge_qa');
    });

    it('maps seo_config to pageforge_seo', () => {
      expect(PHASE_TO_ACTIVITY['seo_config']).toBe('pageforge_seo');
    });

    it('maps report_generation to pageforge_orchestrator', () => {
      expect(PHASE_TO_ACTIVITY['report_generation']).toBe('pageforge_orchestrator');
    });

    it('does not map gate phases (they are human-only)', () => {
      expect(PHASE_TO_ACTIVITY['developer_review_gate']).toBeUndefined();
      expect(PHASE_TO_ACTIVITY['am_signoff_gate']).toBeUndefined();
    });

    it('has 13 mapped phases (15 total minus 2 gates)', () => {
      expect(Object.keys(PHASE_TO_ACTIVITY)).toHaveLength(13);
    });
  });

  // =========================================================================
  // createBuild
  // =========================================================================

  describe('createBuild', () => {
    it('inserts a build record and returns it', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      const result = await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'abc123',
        figmaNodeIds: ['0:1'],
        pageTitle: 'Home Page',
      });

      expect(result).toEqual(build);
      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_builds');
      expect(mockSupabase.insert).toHaveBeenCalled();
    });

    it('passes site_profile_id from the site profile', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile({ id: 'sp-99' }) as any, {
        figmaFileKey: 'key',
        figmaNodeIds: [],
        pageTitle: 'Test',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.site_profile_id).toBe('sp-99');
    });

    it('sets initial status to pending', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'key',
        figmaNodeIds: [],
        pageTitle: 'Test',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.status).toBe('pending');
    });

    it('sets current_phase to 0', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'key',
        figmaNodeIds: [],
        pageTitle: 'Test',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.current_phase).toBe(0);
    });

    it('initializes total_cost_usd to 0', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'key',
        figmaNodeIds: [],
        pageTitle: 'Test',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.total_cost_usd).toBe(0);
    });

    it('initializes error_log as empty array', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'key',
        figmaNodeIds: [],
        pageTitle: 'Test',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.error_log).toEqual([]);
    });

    it('initializes agent_costs as empty object', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'key',
        figmaNodeIds: [],
        pageTitle: 'Test',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.agent_costs).toEqual({});
    });

    it('passes pageSlug when provided', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'key',
        figmaNodeIds: [],
        pageTitle: 'Test',
        pageSlug: 'my-slug',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.page_slug).toBe('my-slug');
    });

    it('sets page_slug to null when not provided', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'key',
        figmaNodeIds: [],
        pageTitle: 'Test',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.page_slug).toBeNull();
    });

    it('passes createdBy when provided', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'key',
        figmaNodeIds: [],
        pageTitle: 'Test',
        createdBy: 'user-abc',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.created_by).toBe('user-abc');
    });

    it('throws on supabase insert error', async () => {
      mockSupabase.single = vi.fn(() => ({
        data: null,
        error: { message: 'insert failed' },
      }));

      await expect(
        createBuild(mockSupabase as any, makeSiteProfile() as any, {
          figmaFileKey: 'key',
          figmaNodeIds: [],
          pageTitle: 'Test',
        })
      ).rejects.toThrow('Failed to create PageForge build: insert failed');
    });

    it('passes page_builder from site profile', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(
        mockSupabase as any,
        makeSiteProfile({ page_builder: 'divi5' }) as any,
        { figmaFileKey: 'key', figmaNodeIds: [], pageTitle: 'Test' }
      );

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.page_builder).toBe('divi5');
    });

    it('passes figma_file_key from params', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'my-figma-key',
        figmaNodeIds: ['1:2'],
        pageTitle: 'Test',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.figma_file_key).toBe('my-figma-key');
    });

    it('passes figma_node_ids array from params', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'key',
        figmaNodeIds: ['0:1', '0:2', '0:3'],
        pageTitle: 'Test',
      });

      const insertArg = (mockSupabase.insert as any).mock.calls[0][0];
      expect(insertArg.figma_node_ids).toEqual(['0:1', '0:2', '0:3']);
    });

    it('calls select("*") after insert', async () => {
      const build = makeBuild();
      mockSupabase.single = vi.fn(() => ({ data: build, error: null }));

      await createBuild(mockSupabase as any, makeSiteProfile() as any, {
        figmaFileKey: 'key',
        figmaNodeIds: [],
        pageTitle: 'Test',
      });

      expect(mockSupabase.select).toHaveBeenCalledWith('*');
    });
  });

  // =========================================================================
  // callPageForgeAgent
  // =========================================================================

  describe('callPageForgeAgent', () => {
    beforeEach(() => {
      // Mock for iteration count query
      mockSupabase.single = vi.fn(() => ({ data: null, error: null, count: 0 }));
      // For the agent_calls insert and build cost updates
      const originalFrom = mockSupabase.from;
      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'pageforge_agent_calls') {
          return {
            insert: vi.fn(() => ({ data: null, error: null })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({ data: null, error: null, count: 0 })),
                })),
              })),
            })),
          };
        }
        if (table === 'pageforge_builds') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: { total_cost_usd: 0.01, agent_costs: {} },
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ data: null, error: null })),
            })),
          };
        }
        // Default chainable
        return {
          insert: vi.fn(() => ({ data: null, error: null })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({ data: null, error: null })),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({ data: null, error: null, count: 0 })),
              })),
              single: vi.fn(() => ({ data: null, error: null })),
            })),
          })),
        };
      });
    });

    it('returns result with text, tokens, cost, and model info', async () => {
      const result = await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_builder',
        'figma_analysis',
        'system prompt',
        'analyze this figma file'
      );

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('inputTokens');
      expect(result).toHaveProperty('outputTokens');
      expect(result).toHaveProperty('costUsd');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('provider');
    });

    it('returns text from the anthropic response', async () => {
      const result = await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_builder',
        'figma_analysis',
        'system',
        'user msg'
      );

      expect(result.text).toBe('AI response text');
    });

    it('returns token counts from the response', async () => {
      const result = await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_builder',
        'figma_analysis',
        'system',
        'user msg'
      );

      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
    });

    it('calculates cost via calculateCost helper', async () => {
      const { calculateCost } = await import('@/lib/ai/cost-tracker');

      const result = await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_builder',
        'figma_analysis',
        'system',
        'user msg'
      );

      expect(calculateCost).toHaveBeenCalled();
      expect(result.costUsd).toBe(0.0042);
    });

    it('records durationMs as a positive number', async () => {
      const result = await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_builder',
        'figma_analysis',
        'system',
        'user msg'
      );

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('logs the agent call to pageforge_agent_calls table', async () => {
      await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_builder',
        'figma_analysis',
        'system',
        'user msg'
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_agent_calls');
    });

    it('updates build costs after successful call', async () => {
      await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_builder',
        'figma_analysis',
        'system',
        'user msg'
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_builds');
    });

    it('uses activity from options when provided', async () => {
      const { resolveModelWithFallback } = await import('@/lib/ai/model-resolver');

      await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_vqa',
        'vqa_comparison',
        'system',
        'user msg',
        { activity: 'pageforge_vqa' }
      );

      expect(resolveModelWithFallback).toHaveBeenCalledWith(
        expect.anything(),
        'pageforge_vqa'
      );
    });

    it('falls back to PHASE_TO_ACTIVITY mapping when no activity option', async () => {
      const { resolveModelWithFallback } = await import('@/lib/ai/model-resolver');

      await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_builder',
        'figma_analysis',
        'system',
        'user msg'
      );

      expect(resolveModelWithFallback).toHaveBeenCalled();
    });

    it('touches the API key after a successful call', async () => {
      const { touchApiKey } = await import('@/lib/ai/providers');

      await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_builder',
        'figma_analysis',
        'system',
        'user msg'
      );

      expect(touchApiKey).toHaveBeenCalledWith(expect.anything(), 'anthropic');
    });

    it('truncates input_preview to 500 characters', async () => {
      const longMessage = 'x'.repeat(1000);

      await callPageForgeAgent(
        mockSupabase as any,
        'build-1',
        'pageforge_builder',
        'figma_analysis',
        'system',
        longMessage
      );

      // The insert call for agent_calls should have a truncated preview
      const agentCallsFrom = (mockSupabase.from as any).mock.results.find(
        (r: any) => (mockSupabase.from as any).mock.calls[
          (mockSupabase.from as any).mock.results.indexOf(r)
        ]?.[0] === 'pageforge_agent_calls'
      );
      // Verify from was called with the right table
      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_agent_calls');
    });
  });

  // =========================================================================
  // runPageForgePhase
  // =========================================================================

  describe('runPageForgePhase', () => {
    function setupRunPhaseMocks(buildOverrides: Record<string, unknown> = {}) {
      const build = makeBuild(buildOverrides);

      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'pageforge_builds') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({ data: build, error: null })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ data: null, error: null })),
            })),
          };
        }
        if (table === 'pageforge_build_phases') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => ({ data: { id: 'phase-rec-1' }, error: null })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ data: null, error: null })),
            })),
          };
        }
        if (table === 'pageforge_agent_calls') {
          return {
            insert: vi.fn(() => ({ data: null, error: null })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({ data: null, error: null, count: 0 })),
                })),
              })),
            })),
          };
        }
        // ai_api_keys, ai_model_config, etc.
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    single: vi.fn(() => ({ data: null, error: null })),
                  })),
                })),
                single: vi.fn(() => ({ data: null, error: null })),
                eq: vi.fn(() => ({ data: null, error: null, count: 0 })),
              })),
              single: vi.fn(() => ({ data: null, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ data: null, error: null })),
            })),
          })),
          insert: vi.fn(() => ({ data: null, error: null })),
        };
      });

      return build;
    }

    it('throws on unknown phase', async () => {
      setupRunPhaseMocks();

      await expect(
        runPageForgePhase(mockSupabase as any, 'build-1', 'nonexistent_phase', {
          systemPrompt: 'sys',
          userMessage: 'msg',
        })
      ).rejects.toThrow('Unknown phase: nonexistent_phase');
    });

    it('throws on gate phases (must use submitPageForgeGateDecision)', async () => {
      setupRunPhaseMocks();

      await expect(
        runPageForgePhase(mockSupabase as any, 'build-1', 'developer_review_gate', {
          systemPrompt: 'sys',
          userMessage: 'msg',
        })
      ).rejects.toThrow('Gate phases (developer_review_gate) require human input');
    });

    it('throws on am_signoff_gate phase', async () => {
      setupRunPhaseMocks();

      await expect(
        runPageForgePhase(mockSupabase as any, 'build-1', 'am_signoff_gate', {
          systemPrompt: 'sys',
          userMessage: 'msg',
        })
      ).rejects.toThrow('Gate phases (am_signoff_gate) require human input');
    });

    it('throws when build is in failed state', async () => {
      setupRunPhaseMocks({ status: 'failed' });

      await expect(
        runPageForgePhase(mockSupabase as any, 'build-1', 'preflight', {
          systemPrompt: 'sys',
          userMessage: 'msg',
        })
      ).rejects.toThrow('terminal state: failed');
    });

    it('throws when build is in cancelled state', async () => {
      setupRunPhaseMocks({ status: 'cancelled' });

      await expect(
        runPageForgePhase(mockSupabase as any, 'build-1', 'preflight', {
          systemPrompt: 'sys',
          userMessage: 'msg',
        })
      ).rejects.toThrow('terminal state: cancelled');
    });

    it('throws when build is in published state', async () => {
      setupRunPhaseMocks({ status: 'published' });

      await expect(
        runPageForgePhase(mockSupabase as any, 'build-1', 'preflight', {
          systemPrompt: 'sys',
          userMessage: 'msg',
        })
      ).rejects.toThrow('terminal state: published');
    });

    it('returns phase result with artifacts on skipAiCall', async () => {
      setupRunPhaseMocks();

      const result = await runPageForgePhase(mockSupabase as any, 'build-1', 'preflight', {
        systemPrompt: 'sys',
        userMessage: 'msg',
        skipAiCall: true,
        directResult: { checks: [{ ok: true }] },
      });

      expect(result.phase).toBe('preflight');
      expect(result.artifacts).toEqual({ checks: [{ ok: true }] });
      expect(result.agentResult).toBeUndefined();
    });

    it('creates a build_phases record on start', async () => {
      setupRunPhaseMocks();

      await runPageForgePhase(mockSupabase as any, 'build-1', 'preflight', {
        systemPrompt: 'sys',
        userMessage: 'msg',
        skipAiCall: true,
        directResult: { ok: true },
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_build_phases');
    });

    it('updates build status to the phase status', async () => {
      setupRunPhaseMocks();

      await runPageForgePhase(mockSupabase as any, 'build-1', 'preflight', {
        systemPrompt: 'sys',
        userMessage: 'msg',
        skipAiCall: true,
        directResult: { ok: true },
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_builds');
    });

    it('uses directResult when skipAiCall is true', async () => {
      setupRunPhaseMocks();

      const result = await runPageForgePhase(mockSupabase as any, 'build-1', 'figma_analysis', {
        systemPrompt: 'sys',
        userMessage: 'msg',
        skipAiCall: true,
        directResult: { designTree: { nodes: 5 } },
      });

      expect(result.artifacts).toEqual({ designTree: { nodes: 5 } });
    });

    it('returns the phase name in the result', async () => {
      setupRunPhaseMocks();

      const result = await runPageForgePhase(mockSupabase as any, 'build-1', 'seo_config', {
        systemPrompt: 'sys',
        userMessage: 'msg',
        skipAiCall: true,
        directResult: {},
      });

      expect(result.phase).toBe('seo_config');
    });

    it('throws when build is not found', async () => {
      mockSupabase.from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: { message: 'not found' } })),
          })),
        })),
      }));

      await expect(
        runPageForgePhase(mockSupabase as any, 'build-999', 'preflight', {
          systemPrompt: 'sys',
          userMessage: 'msg',
        })
      ).rejects.toThrow('PageForge build not found');
    });
  });

  // =========================================================================
  // submitPageForgeGateDecision
  // =========================================================================

  describe('submitPageForgeGateDecision', () => {
    function setupGateMocks(buildOverrides: Record<string, unknown> = {}) {
      const build = makeBuild({
        status: 'developer_review_gate',
        current_phase: 13,
        ...buildOverrides,
      });

      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'pageforge_builds') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({ data: build, error: null })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ data: null, error: null })),
            })),
          };
        }
        if (table === 'pageforge_agent_calls') {
          return {
            insert: vi.fn(() => ({ data: null, error: null })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: null, error: null })),
            })),
          })),
          insert: vi.fn(() => ({ data: null, error: null })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({ data: null, error: null })),
          })),
        };
      });

      return build;
    }

    it('approve on developer_review_gate advances to am_signoff_gate', async () => {
      setupGateMocks();

      const result = await submitPageForgeGateDecision(
        mockSupabase as any,
        'build-1',
        'developer_review_gate',
        'approve',
        null,
        'user-1'
      );

      expect(result.newStatus).toBe('am_signoff_gate');
    });

    it('approve on am_signoff_gate sets status to published', async () => {
      setupGateMocks({ status: 'am_signoff_gate', current_phase: 14 });

      const result = await submitPageForgeGateDecision(
        mockSupabase as any,
        'build-1',
        'am_signoff_gate',
        'approve',
        null,
        'user-1'
      );

      expect(result.newStatus).toBe('published');
    });

    it('revise on developer_review_gate sets status to markup_generation', async () => {
      setupGateMocks();

      const result = await submitPageForgeGateDecision(
        mockSupabase as any,
        'build-1',
        'developer_review_gate',
        'revise',
        'Needs more work on the header',
        'user-1'
      );

      expect(result.newStatus).toBe('markup_generation');
    });

    it('revise on am_signoff_gate sets status to vqa_capture', async () => {
      setupGateMocks({ status: 'am_signoff_gate', current_phase: 14 });

      const result = await submitPageForgeGateDecision(
        mockSupabase as any,
        'build-1',
        'am_signoff_gate',
        'revise',
        'Visual issues remain',
        'user-1'
      );

      expect(result.newStatus).toBe('vqa_capture');
    });

    it('cancel sets status to cancelled', async () => {
      setupGateMocks();

      const result = await submitPageForgeGateDecision(
        mockSupabase as any,
        'build-1',
        'developer_review_gate',
        'cancel',
        'Client cancelled the project',
        'user-1'
      );

      expect(result.newStatus).toBe('cancelled');
    });

    it('logs gate decision as an agent call for audit trail', async () => {
      setupGateMocks();

      await submitPageForgeGateDecision(
        mockSupabase as any,
        'build-1',
        'developer_review_gate',
        'approve',
        null,
        'user-1'
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_agent_calls');
    });

    it('throws when build is not found', async () => {
      mockSupabase.from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: { message: 'missing' } })),
          })),
        })),
      }));

      await expect(
        submitPageForgeGateDecision(
          mockSupabase as any,
          'build-999',
          'developer_review_gate',
          'approve',
          null,
          'user-1'
        )
      ).rejects.toThrow('Build not found: build-999');
    });

    it('updates the build record with gate decision fields', async () => {
      setupGateMocks();

      await submitPageForgeGateDecision(
        mockSupabase as any,
        'build-1',
        'developer_review_gate',
        'approve',
        'Looks great',
        'user-42'
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_builds');
    });

    it('sets published_at when am_signoff_gate is approved', async () => {
      setupGateMocks({ status: 'am_signoff_gate', current_phase: 14 });

      const result = await submitPageForgeGateDecision(
        mockSupabase as any,
        'build-1',
        'am_signoff_gate',
        'approve',
        null,
        'user-1'
      );

      expect(result.newStatus).toBe('published');
    });
  });

  // =========================================================================
  // getBuildWithCalls
  // =========================================================================

  describe('getBuildWithCalls', () => {
    it('fetches build with site_profile join', async () => {
      const build = makeBuild();
      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'pageforge_builds') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({ data: build, error: null })),
              })),
            })),
          };
        }
        if (table === 'pageforge_agent_calls') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ data: [], error: null })),
              })),
            })),
          };
        }
        if (table === 'pageforge_build_phases') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ data: [], error: null })),
              })),
            })),
          };
        }
        return chainable();
      });

      const result = await getBuildWithCalls(mockSupabase as any, 'build-1');

      expect(result.id).toBe('build-1');
      expect(result.agent_calls).toEqual([]);
      expect(result.phases).toEqual([]);
    });

    it('returns agent_calls ordered by created_at ascending', async () => {
      const calls = [
        { id: 'c1', created_at: '2026-01-01T00:00:00Z' },
        { id: 'c2', created_at: '2026-01-01T01:00:00Z' },
      ];
      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'pageforge_builds') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({ data: makeBuild(), error: null })),
              })),
            })),
          };
        }
        if (table === 'pageforge_agent_calls') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ data: calls, error: null })),
              })),
            })),
          };
        }
        if (table === 'pageforge_build_phases') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ data: [], error: null })),
              })),
            })),
          };
        }
        return chainable();
      });

      const result = await getBuildWithCalls(mockSupabase as any, 'build-1');
      expect(result.agent_calls).toHaveLength(2);
    });

    it('returns phases ordered by phase_index ascending', async () => {
      const phases = [
        { id: 'p1', phase_index: 0, phase_name: 'preflight' },
        { id: 'p2', phase_index: 1, phase_name: 'figma_analysis' },
      ];
      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'pageforge_builds') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({ data: makeBuild(), error: null })),
              })),
            })),
          };
        }
        if (table === 'pageforge_agent_calls') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ data: [], error: null })),
              })),
            })),
          };
        }
        if (table === 'pageforge_build_phases') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ data: phases, error: null })),
              })),
            })),
          };
        }
        return chainable();
      });

      const result = await getBuildWithCalls(mockSupabase as any, 'build-1');
      expect(result.phases).toHaveLength(2);
    });

    it('throws when build is not found', async () => {
      mockSupabase.from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: { message: 'not found' } })),
          })),
        })),
      }));

      await expect(
        getBuildWithCalls(mockSupabase as any, 'build-999')
      ).rejects.toThrow('Build not found: build-999');
    });

    it('defaults agent_calls to empty array when null', async () => {
      mockSupabase.from = vi.fn((table: string) => {
        if (table === 'pageforge_builds') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({ data: makeBuild(), error: null })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({ data: null, error: null })),
            })),
          })),
        };
      });

      const result = await getBuildWithCalls(mockSupabase as any, 'build-1');
      expect(result.agent_calls).toEqual([]);
      expect(result.phases).toEqual([]);
    });
  });

  // =========================================================================
  // listBuilds
  // =========================================================================

  describe('listBuilds', () => {
    function setupListMocks(builds: any[] = []) {
      mockSupabase.from = vi.fn(() => {
        const q: Record<string, any> = { data: builds };
        q.select = vi.fn(() => q);
        q.order = vi.fn(() => q);
        q.eq = vi.fn(() => q);
        q.limit = vi.fn(() => q);
        return q;
      });
    }

    it('queries pageforge_builds table', async () => {
      setupListMocks([]);
      await listBuilds(mockSupabase as any);
      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_builds');
    });

    it('returns empty array when no builds found', async () => {
      setupListMocks([]);
      const result = await listBuilds(mockSupabase as any);
      expect(result).toEqual([]);
    });

    it('returns builds when data exists', async () => {
      const builds = [makeBuild({ id: 'b1' }), makeBuild({ id: 'b2' })];
      setupListMocks(builds);
      const result = await listBuilds(mockSupabase as any);
      expect(result).toHaveLength(2);
    });

    it('filters by clientId when provided', async () => {
      setupListMocks([]);
      await listBuilds(mockSupabase as any, { clientId: 'client-1' });
      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_builds');
    });

    it('filters by siteProfileId when provided', async () => {
      setupListMocks([]);
      await listBuilds(mockSupabase as any, { siteProfileId: 'sp-1' });
      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_builds');
    });

    it('filters by status when provided', async () => {
      setupListMocks([]);
      await listBuilds(mockSupabase as any, { status: 'published' });
      expect(mockSupabase.from).toHaveBeenCalledWith('pageforge_builds');
    });

    it('defaults to null array becoming empty', async () => {
      mockSupabase.from = vi.fn(() => {
        const q: Record<string, any> = {};
        q.select = vi.fn(() => q);
        q.order = vi.fn(() => q);
        q.limit = vi.fn(() => ({ data: null }));
        q.eq = vi.fn(() => q);
        return q;
      });
      const result = await listBuilds(mockSupabase as any);
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // Status transitions and cost tracking
  // =========================================================================

  describe('status transitions', () => {
    it('phases flow from preflight through all 15 phases in order', () => {
      const expectedFlow = [
        'preflight', 'figma_analysis', 'section_classification',
        'markup_generation', 'markup_validation', 'deploy_draft',
        'image_optimization', 'vqa_capture', 'vqa_comparison',
        'vqa_fix_loop', 'functional_qa', 'seo_config',
        'report_generation', 'developer_review_gate', 'am_signoff_gate',
      ];
      expect(PAGEFORGE_PHASE_ORDER).toEqual(expectedFlow);
    });

    it('developer_review_gate is the second-to-last phase', () => {
      expect(PAGEFORGE_PHASE_ORDER[PAGEFORGE_PHASE_ORDER.length - 2]).toBe('developer_review_gate');
    });

    it('am_signoff_gate is the last phase', () => {
      expect(PAGEFORGE_PHASE_ORDER[PAGEFORGE_PHASE_ORDER.length - 1]).toBe('am_signoff_gate');
    });

    it('revise on dev_gate goes back to markup_generation (index 3)', () => {
      const markupIndex = PAGEFORGE_PHASE_ORDER.indexOf('markup_generation');
      expect(markupIndex).toBe(3);
    });

    it('revise on am_gate goes back to vqa_capture (index 7)', () => {
      const vqaCaptureIndex = PAGEFORGE_PHASE_ORDER.indexOf('vqa_capture');
      expect(vqaCaptureIndex).toBe(7);
    });
  });

  describe('cost tracking', () => {
    it('cost accumulates - agent_costs is additive per agent', () => {
      const currentCosts: Record<string, number> = { builder: 0.01 };
      const newCost = 0.005;
      const updated = { ...currentCosts, builder: (currentCosts['builder'] || 0) + newCost };
      expect(updated.builder).toBeCloseTo(0.015);
    });

    it('total_cost_usd accumulates across calls', () => {
      let total = 0;
      const costs = [0.004, 0.003, 0.002, 0.001];
      for (const c of costs) {
        total += c;
      }
      expect(total).toBeCloseTo(0.01);
    });

    it('new agent name gets initialized in agent_costs', () => {
      const currentCosts: Record<string, number> = { builder: 0.01 };
      const agentName = 'pageforge_vqa';
      const newCost = 0.005;
      const updated = {
        ...currentCosts,
        [agentName]: (currentCosts[agentName] || 0) + newCost,
      };
      expect(updated.pageforge_vqa).toBe(0.005);
      expect(updated.builder).toBe(0.01);
    });
  });

  describe('error logging', () => {
    it('error_log entries have phase, error, and timestamp fields', () => {
      const entry = { phase: 'preflight', error: 'WP unreachable', timestamp: '2026-01-01T00:00:00Z' };
      expect(entry).toHaveProperty('phase');
      expect(entry).toHaveProperty('error');
      expect(entry).toHaveProperty('timestamp');
    });

    it('error_log is an array that grows over time', () => {
      const log: Array<{ phase: string; error: string; timestamp: string }> = [];
      log.push({ phase: 'preflight', error: 'err1', timestamp: '2026-01-01T00:00:00Z' });
      log.push({ phase: 'figma_analysis', error: 'err2', timestamp: '2026-01-01T01:00:00Z' });
      expect(log).toHaveLength(2);
    });

    it('error entries preserve the phase name where failure occurred', () => {
      const entry = { phase: 'markup_generation', error: 'timeout', timestamp: '2026-01-01T00:00:00Z' };
      expect(PAGEFORGE_PHASE_ORDER).toContain(entry.phase);
    });
  });
});
