import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the pageforge-pipeline callPageForgeAgent
vi.mock('../../lib/ai/pageforge-pipeline', () => ({
  callPageForgeAgent: vi.fn(),
}));

// Mock prompt-templates
vi.mock('../../lib/ai/prompt-templates', () => ({
  getSystemPrompt: vi.fn(() => 'You are a helpful SEO/QA assistant.'),
}));

// Mock wordpress-client
vi.mock('../../lib/integrations/wordpress-client', () => ({
  createWpClient: vi.fn(() => ({
    config: { restUrl: 'https://example.com/wp-json/wp/v2', username: 'admin', appPassword: 'xxxx' },
    headers: { Authorization: 'Basic dGVzdA==' },
  })),
  wpUpdateYoast: vi.fn(),
}));

// Global fetch mock
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  runLinkValidation,
  runResponsiveCheck,
  runLighthouseAudit,
  runAccessibilityCheck,
  compileQaReport,
} from '../../lib/ai/pageforge/qa';

import {
  generateMetaTags,
  generateAltTags,
  validateHeadingHierarchy,
  configureYoast,
  compileSeoReport,
} from '../../lib/ai/pageforge/seo';

import { callPageForgeAgent } from '../../lib/ai/pageforge-pipeline';
import { wpUpdateYoast } from '../../lib/integrations/wordpress-client';

import type { PageForgeSiteProfile, PageForgeBuild } from '../../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSupabase() {
  const updateChain = { eq: vi.fn().mockReturnThis() };
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue(updateChain),
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn() }) }),
    }),
  } as any;
}

function htmlWithLinks(links: string[]): string {
  return `<html><body>${links.map(l => `<a href="${l}">link</a>`).join('')}</body></html>`;
}

function makeSiteProfile(overrides: Partial<PageForgeSiteProfile> = {}): PageForgeSiteProfile {
  return {
    id: 'sp-1',
    client_id: 'c-1',
    site_name: 'Test Site',
    site_url: 'https://example.com',
    wp_rest_url: 'https://example.com/wp-json/wp/v2',
    wp_username: 'admin',
    wp_app_password: 'xxxx-xxxx',
    wp_ssh_host: null,
    wp_ssh_user: null,
    wp_ssh_key_path: null,
    figma_personal_token: 'fig-token',
    figma_team_id: null,
    page_builder: 'gutenberg',
    theme_name: null,
    theme_css_url: null,
    global_css: null,
    yoast_enabled: true,
    vqa_pass_threshold: 85,
    lighthouse_min_score: 80,
    max_vqa_fix_loops: 3,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBuild(overrides: Partial<PageForgeBuild> = {}): PageForgeBuild {
  return {
    id: 'build-1',
    site_profile_id: 'sp-1',
    vps_job_id: null,
    client_id: 'c-1',
    figma_file_key: 'abc123',
    figma_node_ids: ['0:1'],
    page_title: 'Landing Page',
    page_slug: 'landing-page',
    page_builder: 'gutenberg',
    status: 'seo_config',
    current_phase: 11,
    phase_results: {},
    artifacts: {},
    error_log: [],
    wp_page_id: 42,
    wp_draft_url: null,
    wp_preview_url: null,
    wp_live_url: null,
    vqa_score_desktop: null,
    vqa_score_tablet: null,
    vqa_score_mobile: null,
    vqa_score_overall: null,
    lighthouse_performance: null,
    lighthouse_accessibility: null,
    lighthouse_best_practices: null,
    lighthouse_seo: null,
    qa_checks_passed: 0,
    qa_checks_failed: 0,
    qa_checks_total: 0,
    total_cost_usd: 0,
    agent_costs: {},
    dev_gate_decision: null,
    dev_gate_feedback: null,
    dev_gate_decided_by: null,
    dev_gate_decided_at: null,
    am_gate_decision: null,
    am_gate_feedback: null,
    am_gate_decided_by: null,
    am_gate_decided_at: null,
    vqa_fix_iteration: 0,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    published_at: null,
    ...overrides,
  };
}

// ============================================================================
// QA TESTS
// ============================================================================

describe('QA Agent - runLinkValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches page HTML and extracts links', async () => {
    const pageHtml = htmlWithLinks([
      'https://example.com/about',
      'https://example.com/contact',
    ]);

    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => pageHtml }) // page fetch
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' }) // link 1
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' }); // link 2

    const result = await runLinkValidation('https://example.com/page');

    expect(result.name).toBe('Link Validation');
    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.details).toContain('2 links found');
  });

  it('HEAD-checks each extracted link', async () => {
    const pageHtml = htmlWithLinks(['https://a.com', 'https://b.com']);

    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => pageHtml })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    await runLinkValidation('https://example.com');

    // First call is the page fetch; the next two should be HEAD requests
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1][1]).toMatchObject({ method: 'HEAD' });
    expect(mockFetch.mock.calls[2][1]).toMatchObject({ method: 'HEAD' });
  });

  it('reports broken links (404)', async () => {
    const pageHtml = htmlWithLinks(['https://example.com/broken']);

    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => pageHtml })
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

    const result = await runLinkValidation('https://example.com');
    expect(result.passed).toBe(false);
    expect(result.items![0].passed).toBe(false);
    expect(result.items![0].details).toContain('404');
  });

  it('reports broken links (500)', async () => {
    const pageHtml = htmlWithLinks(['https://example.com/error']);

    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => pageHtml })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' });

    const result = await runLinkValidation('https://example.com');
    expect(result.passed).toBe(false);
    expect(result.items![0].severity).toBe('major');
  });

  it('handles pages with no links', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '<html><body>Hello</body></html>' });

    const result = await runLinkValidation('https://example.com');
    expect(result.passed).toBe(true);
    expect(result.items).toHaveLength(0);
    expect(result.details).toContain('0 links found');
  });

  it('limits to 20 links max', async () => {
    const manyLinks = Array.from({ length: 30 }, (_, i) => `https://example.com/p${i}`);
    const pageHtml = htmlWithLinks(manyLinks);

    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => pageHtml });

    // Mock 20 HEAD responses
    for (let i = 0; i < 20; i++) {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });
    }

    const result = await runLinkValidation('https://example.com');
    // 1 page fetch + 20 HEAD checks = 21
    expect(mockFetch).toHaveBeenCalledTimes(21);
    expect(result.items).toHaveLength(20);
    expect(result.details).toContain('30 links found');
    expect(result.details).toContain('20 checked');
  });

  it('handles unreachable links gracefully', async () => {
    const pageHtml = htmlWithLinks(['https://example.com/timeout']);
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => pageHtml })
      .mockRejectedValueOnce(new Error('Fetch timeout'));

    const result = await runLinkValidation('https://example.com');
    expect(result.passed).toBe(false);
    expect(result.items![0].passed).toBe(false);
    expect(result.items![0].details).toBe('Unreachable');
  });

  it('returns failure when page itself is not reachable', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    const result = await runLinkValidation('https://example.com');
    expect(result.passed).toBe(false);
    expect(result.details).toContain('503');
  });

  it('resolves relative links against the page URL', async () => {
    const pageHtml = '<html><body><a href="/about">About</a></body></html>';
    mockFetch
      .mockResolvedValueOnce({ ok: true, text: async () => pageHtml })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

    await runLinkValidation('https://example.com/page');
    expect(mockFetch.mock.calls[1][0]).toBe('https://example.com/about');
  });
});

describe('QA Agent - runResponsiveCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks 4 viewport widths', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ hasOverflow: false, bodyWidth: 320, viewportWidth: 320 }) });

    const result = await runResponsiveCheck('https://example.com', 'https://browserless.local');
    expect(result.items).toHaveLength(4);
    expect(result.items!.map(i => i.label)).toEqual([
      '320px (small mobile)',
      '768px (tablet)',
      '1024px (desktop)',
      '1440px (wide desktop)',
    ]);
  });

  it('detects horizontal scroll issues', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ hasOverflow: true, bodyWidth: 1600, viewportWidth: 320 }),
    });

    const result = await runResponsiveCheck('https://example.com', 'https://browserless.local');
    expect(result.passed).toBe(false);
    const failedItems = result.items!.filter(i => !i.passed);
    expect(failedItems.length).toBeGreaterThan(0);
    expect(failedItems[0].details).toContain('exceeds viewport');
  });

  it('passes when no overflow detected', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ hasOverflow: false, bodyWidth: 320, viewportWidth: 320 }) });

    const result = await runResponsiveCheck('https://example.com', 'https://browserless.local');
    expect(result.passed).toBe(true);
  });

  it('handles Browserless unavailability gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const result = await runResponsiveCheck('https://example.com', 'https://browserless.local');
    // Skipped checks default to passed: true
    expect(result.passed).toBe(true);
    expect(result.items!.every(i => i.details!.includes('unavailable'))).toBe(true);
  });
});

describe('QA Agent - runLighthouseAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Browserless Lighthouse API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        categories: {
          performance: { score: 0.9 },
          accessibility: { score: 0.95 },
          'best-practices': { score: 0.85 },
          seo: { score: 0.88 },
        },
      }),
    });

    await runLighthouseAudit('https://example.com', 'https://browserless.local');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain('/lighthouse');
  });

  it('returns scores for performance/accessibility/best-practices/SEO', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        categories: {
          performance: { score: 0.9 },
          accessibility: { score: 0.95 },
          'best-practices': { score: 0.85 },
          seo: { score: 0.88 },
        },
      }),
    });

    const result = await runLighthouseAudit('https://example.com', 'https://browserless.local');
    expect(result.scores.performance).toBe(90);
    expect(result.scores.accessibility).toBe(95);
    expect(result.scores.bestPractices).toBe(85);
    expect(result.scores.seo).toBe(88);
  });

  it('marks audit as passed when all scores meet thresholds', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        categories: {
          performance: { score: 0.8 },
          accessibility: { score: 0.9 },
          'best-practices': { score: 0.85 },
          seo: { score: 0.88 },
        },
      }),
    });

    const result = await runLighthouseAudit('https://example.com', 'https://browserless.local');
    expect(result.passed).toBe(true);
  });

  it('marks audit as failed when performance below 50', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        categories: {
          performance: { score: 0.3 },
          accessibility: { score: 0.9 },
          'best-practices': { score: 0.85 },
          seo: { score: 0.88 },
        },
      }),
    });

    const result = await runLighthouseAudit('https://example.com', 'https://browserless.local');
    expect(result.passed).toBe(false);
    expect(result.scores.performance).toBe(30);
  });

  it('handles API failures gracefully', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 });

    const result = await runLighthouseAudit('https://example.com', 'https://browserless.local');
    expect(result.passed).toBe(false);
    expect(result.details).toContain('502');
    expect(result.scores).toEqual({ performance: 0, accessibility: 0, bestPractices: 0, seo: 0 });
  });

  it('handles fetch exception gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await runLighthouseAudit('https://example.com', 'https://browserless.local');
    expect(result.passed).toBe(false);
    expect(result.details).toContain('Network failure');
  });
});

describe('QA Agent - runAccessibilityCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects missing alt tags', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        h1Count: 1,
        issues: [
          { type: 'img-alt', element: 'hero.jpg' },
          { type: 'img-alt', element: 'photo.png' },
        ],
      }),
    });

    const result = await runAccessibilityCheck('https://example.com', 'https://browserless.local');
    const imgItem = result.items!.find(i => i.label === 'Image alt text');
    expect(imgItem?.passed).toBe(false);
    expect(imgItem?.details).toContain('2 images missing alt');
  });

  it('passes when all images have alt text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ h1Count: 1, issues: [] }),
    });

    const result = await runAccessibilityCheck('https://example.com', 'https://browserless.local');
    const imgItem = result.items!.find(i => i.label === 'Image alt text');
    expect(imgItem?.passed).toBe(true);
  });

  it('detects heading hierarchy skips', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        h1Count: 1,
        issues: [{ type: 'heading-skip', element: 'Some H4' }],
      }),
    });

    const result = await runAccessibilityCheck('https://example.com', 'https://browserless.local');
    const headingItem = result.items!.find(i => i.label === 'Heading hierarchy');
    expect(headingItem?.passed).toBe(false);
  });

  it('checks for exactly one H1', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ h1Count: 3, issues: [] }),
    });

    const result = await runAccessibilityCheck('https://example.com', 'https://browserless.local');
    const h1Item = result.items!.find(i => i.label === 'H1 count');
    expect(h1Item?.passed).toBe(false);
    expect(h1Item?.details).toContain('3');
  });

  it('handles Browserless unavailability', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await runAccessibilityCheck('https://example.com', 'https://browserless.local');
    expect(result.passed).toBe(true);
    expect(result.details).toContain('unavailable');
  });
});

describe('QA Agent - compileQaReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates all check results', async () => {
    // Mock all 4 fetches that the sub-checks make:
    // runLinkValidation: page fetch
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => '<html></html>' });
    // runResponsiveCheck: 4 viewport checks
    for (let i = 0; i < 4; i++) {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ hasOverflow: false }) });
    }
    // runLighthouseAudit
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        categories: {
          performance: { score: 0.8 },
          accessibility: { score: 0.9 },
          'best-practices': { score: 0.85 },
          seo: { score: 0.9 },
        },
      }),
    });
    // runAccessibilityCheck
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ h1Count: 1, issues: [] }),
    });

    const sb = mockSupabase();
    const result = await compileQaReport(sb, 'build-1', 'https://example.com', 80, 'https://bl.local');

    expect(result.checks).toHaveLength(4);
    expect(result.total).toBe(4);
  });

  it('calculates pass/fail counts', async () => {
    // Link validation fails (page unreachable)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    // Responsive: all pass
    for (let i = 0; i < 4; i++) {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ hasOverflow: false }) });
    }
    // Lighthouse: API failure
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    // Accessibility: pass
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ h1Count: 1, issues: [] }) });

    const sb = mockSupabase();
    const result = await compileQaReport(sb, 'build-1', 'https://example.com', 80, 'https://bl.local');

    expect(result.failed).toBeGreaterThan(0);
    expect(result.passed + result.failed).toBe(result.total);
    expect(result.overallPassed).toBe(false);
  });

  it('updates build with QA scores via supabase', async () => {
    // Because compileQaReport runs 4 checks via Promise.all, fetch mocks
    // interleave unpredictably. Use a smart mock that inspects the URL to
    // return the right response for each sub-check.
    mockFetch.mockImplementation(async (url: string, opts?: any) => {
      const urlStr = String(url);

      // Lighthouse endpoint
      if (urlStr.includes('/lighthouse')) {
        return {
          ok: true,
          json: async () => ({
            categories: {
              performance: { score: 0.91 },
              accessibility: { score: 0.88 },
              'best-practices': { score: 0.85 },
              seo: { score: 0.95 },
            },
          }),
        };
      }

      // Browserless function endpoint (responsive check + a11y check)
      if (urlStr.includes('/function')) {
        return {
          ok: true,
          json: async () => ({ hasOverflow: false, bodyWidth: 320, viewportWidth: 320, h1Count: 1, issues: [] }),
        };
      }

      // Default: page HTML fetch (link validation)
      return { ok: true, text: async () => '<html></html>' };
    });

    const sb = mockSupabase();
    await compileQaReport(sb, 'build-1', 'https://example.com', 80, 'https://bl.local');

    expect(sb.from).toHaveBeenCalledWith('pageforge_builds');
    const fromCall = sb.from.mock.results[0].value;
    expect(fromCall.update).toHaveBeenCalledWith(
      expect.objectContaining({
        lighthouse_performance: 91,
        lighthouse_accessibility: 88,
        lighthouse_best_practices: 85,
        lighthouse_seo: 95,
        qa_checks_passed: expect.any(Number),
        qa_checks_failed: expect.any(Number),
        qa_checks_total: 4,
      })
    );
  });
});

// ============================================================================
// SEO TESTS
// ============================================================================

describe('SEO Agent - generateMetaTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates title under 60 chars', async () => {
    const mockedCall = vi.mocked(callPageForgeAgent);
    mockedCall.mockResolvedValueOnce({
      text: JSON.stringify({
        metaTitle: 'Best Balloons in Charlotte NC',
        metaDesc: 'Order premium balloon decorations for your next event.',
        focusKeyphrase: 'balloon decorations charlotte',
        ogTitle: 'Best Balloons in Charlotte',
        ogDesc: 'Order premium balloon decorations for your next event in Charlotte NC.',
      }),
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      durationMs: 500,
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
    });

    const sb = mockSupabase();
    const result = await generateMetaTags(sb, 'build-1', 'Charlotte Balloons', '<p>Content</p>');
    expect(result.metaTitle.length).toBeLessThanOrEqual(60);
    expect(result.metaTitle).toBe('Best Balloons in Charlotte NC');
  });

  it('generates description under 155 chars', async () => {
    const mockedCall = vi.mocked(callPageForgeAgent);
    mockedCall.mockResolvedValueOnce({
      text: JSON.stringify({
        metaTitle: 'Balloon Decor',
        metaDesc: 'Premium balloon decorations for events.',
        focusKeyphrase: 'balloon decor',
        ogTitle: 'Balloon Decor',
        ogDesc: 'Premium balloon decorations.',
      }),
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    const result = await generateMetaTags(sb, 'build-1', 'Balloon Decor', '<p>Content</p>');
    expect(result.metaDesc.length).toBeLessThanOrEqual(155);
  });

  it('generates focus keyphrase', async () => {
    const mockedCall = vi.mocked(callPageForgeAgent);
    mockedCall.mockResolvedValueOnce({
      text: JSON.stringify({
        metaTitle: 'Title',
        metaDesc: 'Desc',
        focusKeyphrase: 'event decoration services',
        ogTitle: 'Title',
        ogDesc: 'Desc',
      }),
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    const result = await generateMetaTags(sb, 'build-1', 'Event Decoration', '<p>Decor</p>');
    expect(result.focusKeyphrase).toBe('event decoration services');
    expect(result.focusKeyphrase.length).toBeGreaterThan(0);
  });

  it('returns fallback when AI response is not valid JSON', async () => {
    const mockedCall = vi.mocked(callPageForgeAgent);
    mockedCall.mockResolvedValueOnce({
      text: 'I could not generate meta tags right now.',
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    const result = await generateMetaTags(sb, 'build-1', 'Test Page Title', '<p>Body</p>');
    expect(result.metaTitle).toBe('Test Page Title');
    expect(result.metaDesc).toContain('Test Page Title');
    expect(result.focusKeyphrase.length).toBeGreaterThan(0);
  });

  it('strips HTML from content preview sent to AI', async () => {
    const mockedCall = vi.mocked(callPageForgeAgent);
    mockedCall.mockResolvedValueOnce({
      text: JSON.stringify({
        metaTitle: 'T', metaDesc: 'D', focusKeyphrase: 'k', ogTitle: 'T', ogDesc: 'D',
      }),
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    await generateMetaTags(sb, 'build-1', 'Title', '<h1>Hello</h1><p>World</p>');

    expect(mockedCall).toHaveBeenCalledOnce();
    const userMsg = mockedCall.mock.calls[0][4]; // 5th arg is userMessage
    expect(userMsg).not.toContain('<h1>');
    expect(userMsg).not.toContain('<p>');
  });
});

describe('SEO Agent - generateAltTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates alt text for all images', async () => {
    const mockedCall = vi.mocked(callPageForgeAgent);
    mockedCall.mockResolvedValueOnce({
      text: JSON.stringify([
        { imageId: 1, altText: 'Balloon arch in pink and gold' },
        { imageId: 2, altText: 'Event setup with string lights' },
      ]),
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    const result = await generateAltTags(sb, 'build-1', 'Event Page', [
      { id: 1, filename: 'arch.jpg' },
      { id: 2, filename: 'setup.png' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].altText).toBe('Balloon arch in pink and gold');
    expect(result[1].imageId).toBe(2);
  });

  it('handles images with existing alt by using context', async () => {
    const mockedCall = vi.mocked(callPageForgeAgent);
    mockedCall.mockResolvedValueOnce({
      text: JSON.stringify([
        { imageId: 5, altText: 'Hero banner showing outdoor venue' },
      ]),
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    const result = await generateAltTags(sb, 'build-1', 'Venue Page', [
      { id: 5, filename: 'hero-banner.jpg', context: 'Main hero section above the fold' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].altText.length).toBeGreaterThan(0);
  });

  it('returns empty array when no images provided', async () => {
    const sb = mockSupabase();
    const result = await generateAltTags(sb, 'build-1', 'Empty Page', []);
    expect(result).toEqual([]);
    expect(callPageForgeAgent).not.toHaveBeenCalled();
  });

  it('returns fallback alt texts when AI response is invalid', async () => {
    const mockedCall = vi.mocked(callPageForgeAgent);
    mockedCall.mockResolvedValueOnce({
      text: 'Unable to process images.',
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    const result = await generateAltTags(sb, 'build-1', 'Page Title', [
      { id: 10, filename: 'my-photo.jpg' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].imageId).toBe(10);
    expect(result[0].altText).toContain('Page Title');
  });
});

describe('SEO Agent - validateHeadingHierarchy', () => {
  it('passes with single H1 and proper nesting', () => {
    const html = '<h1>Main Title</h1><h2>Section A</h2><h3>Sub A</h3><h2>Section B</h2>';
    const result = validateHeadingHierarchy(html);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('fails with multiple H1s', () => {
    const html = '<h1>First</h1><h2>Sub</h2><h1>Second</h1>';
    const result = validateHeadingHierarchy(html);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Multiple H1'))).toBe(true);
  });

  it('fails with skipped heading levels', () => {
    const html = '<h1>Main</h1><h4>Jumped to H4</h4>';
    const result = validateHeadingHierarchy(html);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Heading level skip'))).toBe(true);
  });

  it('fails when no headings are found', () => {
    const html = '<p>No headings here</p>';
    const result = validateHeadingHierarchy(html);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('No headings found on page');
  });

  it('fails when H1 is missing', () => {
    const html = '<h2>Only H2</h2><h3>And H3</h3>';
    const result = validateHeadingHierarchy(html);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Missing H1'))).toBe(true);
  });

  it('detects multiple issues at once', () => {
    const html = '<h1>First</h1><h1>Second</h1><h4>Skipped</h4>';
    const result = validateHeadingHierarchy(html);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe('SEO Agent - configureYoast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls WP REST API with correct Yoast meta', async () => {
    const sp = makeSiteProfile({ yoast_enabled: true });
    const meta = {
      metaTitle: 'SEO Title',
      metaDesc: 'SEO Description',
      focusKeyphrase: 'balloon decor',
      ogTitle: 'OG Title',
      ogDesc: 'OG Description',
    };

    const result = await configureYoast(sp, 42, meta);
    expect(result.success).toBe(true);
    expect(wpUpdateYoast).toHaveBeenCalledOnce();
    expect(wpUpdateYoast).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ restUrl: sp.wp_rest_url }) }),
      42,
      meta
    );
  });

  it('handles missing Yoast plugin gracefully (yoast_enabled=false)', async () => {
    const sp = makeSiteProfile({ yoast_enabled: false });
    const result = await configureYoast(sp, 42, { metaTitle: 'T' });
    expect(result.success).toBe(true);
    expect(wpUpdateYoast).not.toHaveBeenCalled();
  });

  it('returns error when WP credentials are missing', async () => {
    const sp = makeSiteProfile({ yoast_enabled: true, wp_username: null, wp_app_password: null });
    const result = await configureYoast(sp, 42, { metaTitle: 'T' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('credentials');
  });

  it('returns error when wpUpdateYoast throws', async () => {
    vi.mocked(wpUpdateYoast).mockRejectedValueOnce(new Error('REST API 401 Unauthorized'));
    const sp = makeSiteProfile({ yoast_enabled: true });
    const result = await configureYoast(sp, 42, { metaTitle: 'T' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  });
});

describe('SEO Agent - compileSeoReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces structured checklist with all checks', async () => {
    vi.mocked(callPageForgeAgent).mockResolvedValue({
      text: JSON.stringify({
        metaTitle: 'Great Page Title',
        metaDesc: 'A compelling meta description for SEO.',
        focusKeyphrase: 'great page',
        ogTitle: 'Great Page',
        ogDesc: 'Compelling OG description.',
      }),
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    const sp = makeSiteProfile({ yoast_enabled: true });
    const build = makeBuild({ wp_page_id: 42 });
    const html = '<h1>Main</h1><h2>Section</h2><img src="a.jpg" alt="Photo"><p>Content</p>';

    const result = await compileSeoReport(sb, 'build-1', sp, build, html);

    expect(result.checks).toBeInstanceOf(Array);
    expect(result.checks.length).toBeGreaterThanOrEqual(5);
    const checkNames = result.checks.map(c => c.name);
    expect(checkNames).toContain('Meta Title');
    expect(checkNames).toContain('Meta Description');
    expect(checkNames).toContain('Focus Keyphrase');
    expect(checkNames).toContain('Heading Hierarchy');
    expect(checkNames).toContain('Image Alt Text');
    expect(checkNames).toContain('Open Graph Tags');
  });

  it('includes heading hierarchy validation', async () => {
    vi.mocked(callPageForgeAgent).mockResolvedValue({
      text: JSON.stringify({
        metaTitle: 'T', metaDesc: 'D', focusKeyphrase: 'k', ogTitle: 'OG', ogDesc: 'OGD',
      }),
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    const sp = makeSiteProfile({ yoast_enabled: false });
    const build = makeBuild({ wp_page_id: null });
    const html = '<h1>Title</h1><h2>Sub</h2>';

    const result = await compileSeoReport(sb, 'build-1', sp, build, html);
    expect(result.headingHierarchy.valid).toBe(true);
    expect(result.headingHierarchy.issues).toHaveLength(0);
  });

  it('counts images with and without alt text', async () => {
    vi.mocked(callPageForgeAgent).mockResolvedValue({
      text: JSON.stringify({
        metaTitle: 'T', metaDesc: 'D', focusKeyphrase: 'k', ogTitle: 'OG', ogDesc: 'OGD',
      }),
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    const sp = makeSiteProfile({ yoast_enabled: false });
    const build = makeBuild({ wp_page_id: null });
    const html = '<h1>T</h1><img src="a.jpg" alt="Photo"><img src="b.jpg"><img src="c.jpg" alt="Another">';

    const result = await compileSeoReport(sb, 'build-1', sp, build, html);
    expect(result.altTagsCoverage.total).toBe(3);
    expect(result.altTagsCoverage.withAlt).toBe(2);
  });

  it('skips Yoast configuration when wp_page_id is null', async () => {
    vi.mocked(callPageForgeAgent).mockResolvedValue({
      text: JSON.stringify({
        metaTitle: 'T', metaDesc: 'D', focusKeyphrase: 'k', ogTitle: 'OG', ogDesc: 'OGD',
      }),
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });

    const sb = mockSupabase();
    const sp = makeSiteProfile({ yoast_enabled: true });
    const build = makeBuild({ wp_page_id: null });

    const result = await compileSeoReport(sb, 'build-1', sp, build, '<h1>T</h1>');
    expect(result.configured).toBe(false);
    expect(wpUpdateYoast).not.toHaveBeenCalled();
  });

  it('reports configured=true when Yoast update succeeds', async () => {
    vi.mocked(callPageForgeAgent).mockResolvedValue({
      text: JSON.stringify({
        metaTitle: 'T', metaDesc: 'D', focusKeyphrase: 'k', ogTitle: 'OG', ogDesc: 'OGD',
      }),
      inputTokens: 100, outputTokens: 50, costUsd: 0.001, durationMs: 500, model: 'm', provider: 'anthropic',
    });
    vi.mocked(wpUpdateYoast).mockResolvedValueOnce(undefined);

    const sb = mockSupabase();
    const sp = makeSiteProfile({ yoast_enabled: true });
    const build = makeBuild({ wp_page_id: 42 });

    const result = await compileSeoReport(sb, 'build-1', sp, build, '<h1>T</h1>');
    expect(result.configured).toBe(true);
  });
});
