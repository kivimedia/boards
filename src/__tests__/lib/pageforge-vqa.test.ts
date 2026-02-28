import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@/lib/integrations/figma-client', () => ({
  createFigmaClient: vi.fn(() => ({ token: 'mock-token' })),
  figmaGetImages: vi.fn(),
  figmaDownloadImage: vi.fn(),
}));

vi.mock('@/lib/ai/pageforge-pipeline', () => ({
  callPageForgeAgent: vi.fn(),
}));

vi.mock('@/lib/ai/prompt-templates', () => ({
  getSystemPrompt: vi.fn(() => 'mock-vqa-system-prompt'),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import {
  captureScreenshots,
  exportFigmaScreenshots,
  runVqaComparison,
  suggestVqaFixes,
  uploadVqaScreenshots,
} from '@/lib/ai/pageforge/vqa';
import type {
  ScreenshotSet,
  VqaComparisonResult,
  VqaDiffResult,
} from '@/lib/ai/pageforge/vqa';

import {
  createFigmaClient,
  figmaGetImages,
  figmaDownloadImage,
} from '@/lib/integrations/figma-client';

import { callPageForgeAgent } from '@/lib/ai/pageforge-pipeline';
import { getSystemPrompt } from '@/lib/ai/prompt-templates';

import type { PageForgeSiteProfile } from '@/lib/types';

// ============================================================================
// HELPERS
// ============================================================================

function mockSupabase() {
  const uploadMock = vi.fn().mockResolvedValue({ error: null });
  const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: 'https://cdn.example.com/vqa/img.png' } }));

  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
    _uploadMock: uploadMock,
    _getPublicUrlMock: getPublicUrlMock,
  } as any;
}

function makeSiteProfile(overrides?: Partial<PageForgeSiteProfile>): PageForgeSiteProfile {
  return {
    id: 'sp-1',
    client_id: null,
    site_name: 'Test Site',
    site_url: 'https://example.com',
    wp_rest_url: 'https://example.com/wp-json/wp/v2',
    wp_username: 'admin',
    wp_app_password: 'xxxx',
    wp_ssh_host: null,
    wp_ssh_user: null,
    wp_ssh_key_path: null,
    figma_personal_token: 'figd_token_abc',
    figma_team_id: null,
    page_builder: 'gutenberg',
    theme_name: null,
    theme_css_url: null,
    global_css: null,
    yoast_enabled: false,
    vqa_pass_threshold: 95,
    lighthouse_min_score: 80,
    max_vqa_fix_loops: 3,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const mockAgentResult = (text: string) => ({
  text,
  inputTokens: 100,
  outputTokens: 200,
  costUsd: 0.005,
  durationMs: 2000,
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
});

function makeScreenshotSet(overrides?: Partial<ScreenshotSet>): ScreenshotSet {
  return {
    desktop: Buffer.from('desktop-png-data').toString('base64'),
    tablet: Buffer.from('tablet-png-data').toString('base64'),
    mobile: Buffer.from('mobile-png-data').toString('base64'),
    ...overrides,
  };
}

function makeComparisonResult(overrides?: Partial<VqaComparisonResult>): VqaComparisonResult {
  return {
    desktop: { breakpoint: 'desktop', score: 90, differences: [{ area: 'hero', severity: 'major', description: 'Color mismatch', suggestedFix: 'Change background to #333' }] },
    tablet: { breakpoint: 'tablet', score: 85, differences: [{ area: 'nav', severity: 'minor', description: 'Padding off' }] },
    mobile: { breakpoint: 'mobile', score: 80, differences: [{ area: 'footer', severity: 'critical', description: 'Footer overlaps', suggestedFix: 'Add margin-top: 20px' }] },
    overallScore: 86,
    passed: false,
    fixSuggestions: ['Change background to #333', 'Add margin-top: 20px'],
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('PageForge VQA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createFigmaClient).mockReturnValue({ token: 'mock-token' } as any);
    vi.mocked(getSystemPrompt).mockReturnValue('mock-vqa-system-prompt');
  });

  // ==========================================================================
  // captureScreenshots
  // ==========================================================================

  describe('captureScreenshots', () => {
    it('calls Browserless API at 3 breakpoints (1440, 768, 375)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      });
      vi.stubGlobal('fetch', mockFetch);

      await captureScreenshots('https://example.com/page', 'https://browserless.test');

      expect(mockFetch).toHaveBeenCalledTimes(3);

      const widths = mockFetch.mock.calls.map((call: any[]) => {
        const body = JSON.parse(call[1].body);
        return body.viewport.width;
      });
      expect(widths).toContain(1440);
      expect(widths).toContain(768);
      expect(widths).toContain(375);
    });

    it('returns base64 screenshots keyed by breakpoint', async () => {
      const pngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => pngData.buffer,
      }));

      const result = await captureScreenshots('https://example.com/page', 'https://browserless.test');

      expect(result.desktop).toBeTruthy();
      expect(result.tablet).toBeTruthy();
      expect(result.mobile).toBeTruthy();
      // Verify they are base64 strings
      expect(typeof result.desktop).toBe('string');
      expect(typeof result.tablet).toBe('string');
      expect(typeof result.mobile).toBe('string');
    });

    it('handles Browserless API errors gracefully (returns null for failed breakpoints)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      const result = await captureScreenshots('https://example.com/page', 'https://browserless.test');

      expect(result.desktop).toBeNull();
      expect(result.tablet).toBeNull();
      expect(result.mobile).toBeNull();
      consoleSpy.mockRestore();
    });

    it('handles fetch rejection gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await captureScreenshots('https://example.com/page', 'https://browserless.test');

      expect(result.desktop).toBeNull();
      expect(result.tablet).toBeNull();
      expect(result.mobile).toBeNull();
      consoleSpy.mockRestore();
    });

    it('sends full page screenshot options', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      });
      vi.stubGlobal('fetch', mockFetch);

      await captureScreenshots('https://example.com/page', 'https://browserless.test');

      const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstCallBody.options.fullPage).toBe(true);
      expect(firstCallBody.options.type).toBe('png');
      expect(firstCallBody.url).toBe('https://example.com/page');
    });

    it('uses the provided browserless URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      });
      vi.stubGlobal('fetch', mockFetch);

      await captureScreenshots('https://example.com/page', 'https://custom-browserless.io');

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('https://custom-browserless.io/screenshot');
    });
  });

  // ==========================================================================
  // exportFigmaScreenshots
  // ==========================================================================

  describe('exportFigmaScreenshots', () => {
    it('calls figmaGetImages for node IDs', async () => {
      const siteProfile = makeSiteProfile();
      vi.mocked(figmaGetImages).mockResolvedValue({
        images: { '1:2': 'https://figma-cdn.com/rendered.png' },
      } as any);
      vi.mocked(figmaDownloadImage).mockResolvedValue(Buffer.from('png-data'));

      await exportFigmaScreenshots(siteProfile, 'abc123', ['1:2']);

      expect(figmaGetImages).toHaveBeenCalledWith(
        expect.anything(),
        'abc123',
        ['1:2'],
        { format: 'png', scale: 1 }
      );
    });

    it('downloads exported images as base64', async () => {
      const siteProfile = makeSiteProfile();
      const imgBuffer = Buffer.from('image-content');

      vi.mocked(figmaGetImages).mockResolvedValue({
        images: { '1:2': 'https://figma-cdn.com/rendered.png' },
      } as any);
      vi.mocked(figmaDownloadImage).mockResolvedValue(imgBuffer);

      const result = await exportFigmaScreenshots(siteProfile, 'abc123', ['1:2']);

      expect(figmaDownloadImage).toHaveBeenCalledWith('https://figma-cdn.com/rendered.png');
      expect(result.desktop).toBe(imgBuffer.toString('base64'));
    });

    it('uses same image for all breakpoints (Figma has no native breakpoints)', async () => {
      const siteProfile = makeSiteProfile();
      vi.mocked(figmaGetImages).mockResolvedValue({
        images: { '1:2': 'https://figma-cdn.com/img.png' },
      } as any);
      vi.mocked(figmaDownloadImage).mockResolvedValue(Buffer.from('data'));

      const result = await exportFigmaScreenshots(siteProfile, 'abc123', ['1:2']);

      expect(result.desktop).toBe(result.tablet);
      expect(result.tablet).toBe(result.mobile);
    });

    it('returns null screenshots when no Figma token', async () => {
      const siteProfile = makeSiteProfile({ figma_personal_token: null });

      const result = await exportFigmaScreenshots(siteProfile, 'abc123', ['1:2']);

      expect(result.desktop).toBeNull();
      expect(result.tablet).toBeNull();
      expect(result.mobile).toBeNull();
    });

    it('returns null screenshots when node IDs array is empty', async () => {
      const siteProfile = makeSiteProfile();

      const result = await exportFigmaScreenshots(siteProfile, 'abc123', []);

      expect(result.desktop).toBeNull();
      expect(result.tablet).toBeNull();
      expect(result.mobile).toBeNull();
    });

    it('returns null screenshots when no image URL is available', async () => {
      const siteProfile = makeSiteProfile();
      vi.mocked(figmaGetImages).mockResolvedValue({
        images: { '1:2': null },
      } as any);

      const result = await exportFigmaScreenshots(siteProfile, 'abc123', ['1:2']);

      expect(result.desktop).toBeNull();
    });
  });

  // ==========================================================================
  // runVqaComparison
  // ==========================================================================

  describe('runVqaComparison', () => {
    it('sends screenshot pairs to AI vision model for each breakpoint', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet();
      const wp = makeScreenshotSet();

      const vqaResponse = JSON.stringify({ score: 92, differences: [] });
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(vqaResponse));

      await runVqaComparison(supabase, 'build-1', figma, wp, 95);

      expect(callPageForgeAgent).toHaveBeenCalledTimes(3);

      // Check that images are passed to the agent
      for (const call of vi.mocked(callPageForgeAgent).mock.calls) {
        const options = call[6] as any;
        expect(options.images).toHaveLength(2);
        expect(options.images[0].mimeType).toBe('image/png');
        expect(options.images[1].mimeType).toBe('image/png');
      }
    });

    it('returns per-breakpoint scores', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet();
      const wp = makeScreenshotSet();

      vi.mocked(callPageForgeAgent)
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({ score: 95, differences: [] })))
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({ score: 88, differences: [] })))
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({ score: 82, differences: [] })));

      const result = await runVqaComparison(supabase, 'build-1', figma, wp, 90);

      expect(result.desktop.score).toBe(95);
      expect(result.tablet.score).toBe(88);
      expect(result.mobile.score).toBe(82);
    });

    it('calculates weighted overall score (desktop 50%, tablet 25%, mobile 25%)', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet();
      const wp = makeScreenshotSet();

      // Desktop=100, Tablet=80, Mobile=60 -> weighted = 100*0.5 + 80*0.25 + 60*0.25 = 50+20+15 = 85
      vi.mocked(callPageForgeAgent)
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({ score: 100, differences: [] })))
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({ score: 80, differences: [] })))
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({ score: 60, differences: [] })));

      const result = await runVqaComparison(supabase, 'build-1', figma, wp, 90);

      expect(result.overallScore).toBe(85);
    });

    it('marks as passed when overall score >= threshold', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet();
      const wp = makeScreenshotSet();

      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult(JSON.stringify({ score: 96, differences: [] }))
      );

      const result = await runVqaComparison(supabase, 'build-1', figma, wp, 95);

      expect(result.passed).toBe(true);
    });

    it('marks as failed when overall score < threshold', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet();
      const wp = makeScreenshotSet();

      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult(JSON.stringify({ score: 70, differences: [] }))
      );

      const result = await runVqaComparison(supabase, 'build-1', figma, wp, 95);

      expect(result.passed).toBe(false);
    });

    it('uses default threshold of 95 when configured via site profile', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet();
      const wp = makeScreenshotSet();

      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult(JSON.stringify({ score: 94, differences: [] }))
      );

      // Pass 95 as threshold (the default from site profile)
      const result = await runVqaComparison(supabase, 'build-1', figma, wp, 95);
      expect(result.passed).toBe(false);

      // Pass 90 as a custom threshold
      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult(JSON.stringify({ score: 94, differences: [] }))
      );
      const result2 = await runVqaComparison(supabase, 'build-1', figma, wp, 90);
      expect(result2.passed).toBe(true);
    });

    it('identifies specific discrepancies in differences array', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet();
      const wp = makeScreenshotSet();

      const vqaResponse = JSON.stringify({
        score: 75,
        differences: [
          { area: 'hero', severity: 'critical', description: 'Background color wrong', suggestedFix: 'Change to #1a1a1a' },
          { area: 'nav', severity: 'minor', description: 'Font size slightly off' },
        ],
      });
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(vqaResponse));

      const result = await runVqaComparison(supabase, 'build-1', figma, wp, 95);

      expect(result.desktop.differences).toHaveLength(2);
      expect(result.desktop.differences[0].area).toBe('hero');
      expect(result.desktop.differences[0].severity).toBe('critical');
      expect(result.desktop.differences[0].suggestedFix).toBe('Change to #1a1a1a');
    });

    it('collects fix suggestions from all breakpoints', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet();
      const wp = makeScreenshotSet();

      vi.mocked(callPageForgeAgent)
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({
          score: 80, differences: [{ area: 'hero', severity: 'major', description: 'Color off', suggestedFix: 'Fix A' }],
        })))
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({
          score: 80, differences: [{ area: 'nav', severity: 'minor', description: 'Spacing', suggestedFix: 'Fix B' }],
        })))
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({
          score: 80, differences: [],
        })));

      const result = await runVqaComparison(supabase, 'build-1', figma, wp, 95);

      expect(result.fixSuggestions).toContain('Fix A');
      expect(result.fixSuggestions).toContain('Fix B');
    });

    it('handles missing screenshots (null) by scoring 0 with critical difference', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet({ mobile: null });
      const wp = makeScreenshotSet();

      vi.mocked(callPageForgeAgent)
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({ score: 90, differences: [] })))
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({ score: 85, differences: [] })));
      // Mobile comparison should be skipped because figma mobile is null

      const result = await runVqaComparison(supabase, 'build-1', figma, wp, 95);

      expect(result.mobile.score).toBe(0);
      expect(result.mobile.differences[0].severity).toBe('critical');
      expect(result.mobile.differences[0].description).toContain('not available');
    });

    it('handles AI comparison failure gracefully', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet();
      const wp = makeScreenshotSet();

      vi.mocked(callPageForgeAgent)
        .mockRejectedValueOnce(new Error('AI service unavailable'))
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({ score: 90, differences: [] })))
        .mockResolvedValueOnce(mockAgentResult(JSON.stringify({ score: 90, differences: [] })));

      const result = await runVqaComparison(supabase, 'build-1', figma, wp, 95);

      expect(result.desktop.score).toBe(0);
      expect(result.desktop.differences[0].description).toContain('VQA comparison failed');
    });

    it('handles non-JSON AI response by defaulting to score 50', async () => {
      const supabase = mockSupabase();
      const figma = makeScreenshotSet();
      const wp = makeScreenshotSet();

      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult('The pages look somewhat similar but have differences')
      );

      const result = await runVqaComparison(supabase, 'build-1', figma, wp, 95);

      expect(result.desktop.score).toBe(50);
      expect(result.desktop.differences).toEqual([]);
    });
  });

  // ==========================================================================
  // suggestVqaFixes
  // ==========================================================================

  describe('suggestVqaFixes', () => {
    it('generates CSS/markup fixes from comparison results', async () => {
      const supabase = mockSupabase();
      const comparison = makeComparisonResult();
      const currentMarkup = '<div class="hero" style="background: #fff;">Hello</div>';

      const fixResponse = JSON.stringify({
        fixedMarkup: '<div class="hero" style="background: #333;">Hello</div>',
        changesApplied: ['Changed hero background from #fff to #333'],
      });
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(fixResponse));

      const result = await suggestVqaFixes(supabase, 'build-1', comparison, currentMarkup);

      expect(result.fixedMarkup).toContain('#333');
      expect(result.changesApplied).toHaveLength(1);
      expect(result.changesApplied[0]).toContain('background');
    });

    it('returns structured fix objects with changesApplied array', async () => {
      const supabase = mockSupabase();
      const comparison = makeComparisonResult();
      const currentMarkup = '<div>current</div>';

      const fixResponse = JSON.stringify({
        fixedMarkup: '<div>fixed</div>',
        changesApplied: ['Fix 1', 'Fix 2', 'Fix 3'],
      });
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(fixResponse));

      const result = await suggestVqaFixes(supabase, 'build-1', comparison, currentMarkup);

      expect(result.changesApplied).toEqual(['Fix 1', 'Fix 2', 'Fix 3']);
    });

    it('returns original markup when no critical/major differences exist', async () => {
      const supabase = mockSupabase();
      const comparison = makeComparisonResult({
        desktop: { breakpoint: 'desktop', score: 98, differences: [{ area: 'footer', severity: 'minor', description: 'Tiny spacing' }] },
        tablet: { breakpoint: 'tablet', score: 97, differences: [] },
        mobile: { breakpoint: 'mobile', score: 96, differences: [] },
      });
      const currentMarkup = '<div>all good</div>';

      const result = await suggestVqaFixes(supabase, 'build-1', comparison, currentMarkup);

      expect(result.fixedMarkup).toBe(currentMarkup);
      expect(result.changesApplied).toEqual([]);
      expect(callPageForgeAgent).not.toHaveBeenCalled();
    });

    it('includes differences from all breakpoints in fix prompt', async () => {
      const supabase = mockSupabase();
      const comparison = makeComparisonResult();
      const currentMarkup = '<div>markup</div>';

      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult(JSON.stringify({ fixedMarkup: '<div>fixed</div>', changesApplied: ['fix'] }))
      );

      await suggestVqaFixes(supabase, 'build-1', comparison, currentMarkup);

      const userMessage = vi.mocked(callPageForgeAgent).mock.calls[0][5] as string;
      expect(userMessage).toContain('desktop');
      expect(userMessage).toContain('mobile');
      expect(userMessage).toContain('Color mismatch');
      expect(userMessage).toContain('Footer overlaps');
    });

    it('falls back to original markup when AI returns non-JSON', async () => {
      const supabase = mockSupabase();
      const comparison = makeComparisonResult();
      const currentMarkup = '<div>original</div>';

      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult('I could not generate fixes for this page.')
      );

      const result = await suggestVqaFixes(supabase, 'build-1', comparison, currentMarkup);

      expect(result.fixedMarkup).toBe(currentMarkup);
      expect(result.changesApplied).toEqual([]);
    });

    it('calls AI with pageforge_vqa activity', async () => {
      const supabase = mockSupabase();
      const comparison = makeComparisonResult();

      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult(JSON.stringify({ fixedMarkup: '<div/>', changesApplied: [] }))
      );

      await suggestVqaFixes(supabase, 'build-1', comparison, '<div>x</div>');

      expect(callPageForgeAgent).toHaveBeenCalledWith(
        supabase,
        'build-1',
        'pageforge_vqa_fix',
        'vqa_fix_loop',
        expect.any(String),
        expect.any(String),
        { activity: 'pageforge_vqa' }
      );
    });
  });

  // ==========================================================================
  // uploadVqaScreenshots
  // ==========================================================================

  describe('uploadVqaScreenshots', () => {
    it('uploads screenshots to Supabase storage bucket', async () => {
      const supabase = mockSupabase();
      const screenshots = makeScreenshotSet();

      const urls = await uploadVqaScreenshots(supabase, 'build-1', screenshots, 'figma');

      expect(supabase.storage.from).toHaveBeenCalledWith('pageforge-artifacts');
      expect(supabase._uploadMock).toHaveBeenCalledTimes(3);
    });

    it('uses correct path format: builds/{buildId}/vqa/{prefix}-{breakpoint}.png', async () => {
      const supabase = mockSupabase();
      const screenshots = makeScreenshotSet();

      await uploadVqaScreenshots(supabase, 'build-abc', screenshots, 'wp');

      const uploadCalls = supabase._uploadMock.mock.calls;
      const paths = uploadCalls.map((call: any[]) => call[0]);

      expect(paths).toContain('builds/build-abc/vqa/wp-desktop.png');
      expect(paths).toContain('builds/build-abc/vqa/wp-tablet.png');
      expect(paths).toContain('builds/build-abc/vqa/wp-mobile.png');
    });

    it('returns public URLs keyed by breakpoint', async () => {
      const supabase = mockSupabase();
      const screenshots = makeScreenshotSet();

      const urls = await uploadVqaScreenshots(supabase, 'build-1', screenshots, 'figma');

      expect(urls).toHaveProperty('desktop');
      expect(urls).toHaveProperty('tablet');
      expect(urls).toHaveProperty('mobile');
      expect(urls.desktop).toContain('https://');
    });

    it('skips null screenshots', async () => {
      const supabase = mockSupabase();
      const screenshots = makeScreenshotSet({ mobile: null });

      const urls = await uploadVqaScreenshots(supabase, 'build-1', screenshots, 'figma');

      expect(supabase._uploadMock).toHaveBeenCalledTimes(2);
      expect(urls).not.toHaveProperty('mobile');
    });

    it('does not include URL for failed uploads', async () => {
      const supabase = mockSupabase();
      supabase._uploadMock.mockResolvedValue({ error: { message: 'Upload failed' } });
      const screenshots = makeScreenshotSet();

      const urls = await uploadVqaScreenshots(supabase, 'build-1', screenshots, 'figma');

      expect(Object.keys(urls)).toHaveLength(0);
    });

    it('uploads with correct content type and upsert option', async () => {
      const supabase = mockSupabase();
      const screenshots = makeScreenshotSet();

      await uploadVqaScreenshots(supabase, 'build-1', screenshots, 'wp');

      const firstUploadCall = supabase._uploadMock.mock.calls[0];
      expect(firstUploadCall[2]).toEqual({ contentType: 'image/png', upsert: true });
    });

    it('uses figma prefix for Figma screenshots', async () => {
      const supabase = mockSupabase();
      const screenshots = makeScreenshotSet({ tablet: null, mobile: null });

      await uploadVqaScreenshots(supabase, 'build-1', screenshots, 'figma');

      const path = supabase._uploadMock.mock.calls[0][0];
      expect(path).toContain('figma-desktop');
    });

    it('uses wp prefix for WordPress screenshots', async () => {
      const supabase = mockSupabase();
      const screenshots = makeScreenshotSet({ tablet: null, mobile: null });

      await uploadVqaScreenshots(supabase, 'build-1', screenshots, 'wp');

      const path = supabase._uploadMock.mock.calls[0][0];
      expect(path).toContain('wp-desktop');
    });
  });
});
