import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runLighthouseAudit,
  runAxeAudit,
  runFullAudit,
} from '@/lib/ai/lighthouse-audit';
import type {
  LighthouseScores,
  AxeViolation,
  AuditResult,
} from '@/lib/ai/lighthouse-audit';

describe('lighthouse-audit', () => {
  // ===========================================================================
  // Exports verification
  // ===========================================================================

  describe('exports', () => {
    it('exports runLighthouseAudit as a function', () => {
      expect(typeof runLighthouseAudit).toBe('function');
    });

    it('exports runAxeAudit as a function', () => {
      expect(typeof runAxeAudit).toBe('function');
    });

    it('exports runFullAudit as a function', () => {
      expect(typeof runFullAudit).toBe('function');
    });
  });

  // ===========================================================================
  // Interface shape verification
  // ===========================================================================

  describe('interface shape verification', () => {
    it('LighthouseScores has the correct shape', () => {
      const scores: LighthouseScores = {
        performance: 95,
        accessibility: 90,
        bestPractices: 85,
        seo: 100,
      };
      expect(scores).toHaveProperty('performance');
      expect(scores).toHaveProperty('accessibility');
      expect(scores).toHaveProperty('bestPractices');
      expect(scores).toHaveProperty('seo');
    });

    it('AxeViolation has the correct shape', () => {
      const violation: AxeViolation = {
        id: 'color-contrast',
        description: 'Elements must have sufficient color contrast',
        impact: 'serious',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/color-contrast',
        nodes: 3,
      };
      expect(violation).toHaveProperty('id');
      expect(violation).toHaveProperty('description');
      expect(violation).toHaveProperty('impact');
      expect(violation).toHaveProperty('helpUrl');
      expect(violation).toHaveProperty('nodes');
    });

    it('AuditResult has the correct shape', () => {
      const result: AuditResult = {
        lighthouseScores: null,
        axeViolations: [],
        performanceMetrics: {
          load_time_ms: 0,
          first_paint_ms: 0,
          dom_content_loaded_ms: 0,
        },
      };
      expect(result).toHaveProperty('lighthouseScores');
      expect(result).toHaveProperty('axeViolations');
      expect(result).toHaveProperty('performanceMetrics');
    });
  });

  // ===========================================================================
  // runLighthouseAudit — no API key
  // ===========================================================================

  describe('runLighthouseAudit — no API key', () => {
    beforeEach(() => {
      delete process.env.BROWSERLESS_API_KEY;
    });

    it('returns null when BROWSERLESS_API_KEY is not set', async () => {
      const result = await runLighthouseAudit('https://example.com');
      expect(result).toBeNull();
    });

    it('does not call fetch when API key is missing', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await runLighthouseAudit('https://example.com');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  // ===========================================================================
  // runAxeAudit — no API key
  // ===========================================================================

  describe('runAxeAudit — no API key', () => {
    beforeEach(() => {
      delete process.env.BROWSERLESS_API_KEY;
    });

    it('returns empty array when BROWSERLESS_API_KEY is not set', async () => {
      const result = await runAxeAudit('https://example.com');
      expect(result).toEqual([]);
    });

    it('does not call fetch when API key is missing', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await runAxeAudit('https://example.com');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  // ===========================================================================
  // runFullAudit — no API key
  // ===========================================================================

  describe('runFullAudit — no API key', () => {
    beforeEach(() => {
      delete process.env.BROWSERLESS_API_KEY;
    });

    it('returns correct shape with null scores and empty violations', async () => {
      const result = await runFullAudit('https://example.com');
      expect(result.lighthouseScores).toBeNull();
      expect(result.axeViolations).toEqual([]);
      expect(result.performanceMetrics).toEqual({
        load_time_ms: 0,
        first_paint_ms: 0,
        dom_content_loaded_ms: 0,
      });
    });
  });

  // ===========================================================================
  // runLighthouseAudit — with mocked fetch (successful response)
  // ===========================================================================

  describe('runLighthouseAudit — successful response', () => {
    beforeEach(() => {
      process.env.BROWSERLESS_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.BROWSERLESS_API_KEY;
      vi.restoreAllMocks();
    });

    it('scores are multiplied by 100 and rounded', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            lighthouse: {
              performance: 0.856,
              accessibility: 0.923,
              'best-practices': 0.714,
              seo: 0.998,
            },
          }),
          { status: 200 }
        )
      );

      const result = await runLighthouseAudit('https://example.com');
      expect(result).not.toBeNull();
      expect(result!.performance).toBe(86);
      expect(result!.accessibility).toBe(92);
      expect(result!.bestPractices).toBe(71);
      expect(result!.seo).toBe(100);
    });

    it('falls back to performanceScore field', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            performanceScore: 0.75,
          }),
          { status: 200 }
        )
      );

      const result = await runLighthouseAudit('https://example.com');
      expect(result).not.toBeNull();
      expect(result!.performance).toBe(75);
      // Other scores default to 0 when not present
      expect(result!.accessibility).toBe(0);
      expect(result!.bestPractices).toBe(0);
      expect(result!.seo).toBe(0);
    });

    it('returns all zeros when lighthouse data is empty', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 })
      );

      const result = await runLighthouseAudit('https://example.com');
      expect(result).not.toBeNull();
      expect(result!.performance).toBe(0);
      expect(result!.accessibility).toBe(0);
      expect(result!.bestPractices).toBe(0);
      expect(result!.seo).toBe(0);
    });
  });

  // ===========================================================================
  // runLighthouseAudit — non-200 and error handling
  // ===========================================================================

  describe('runLighthouseAudit — error handling', () => {
    beforeEach(() => {
      process.env.BROWSERLESS_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.BROWSERLESS_API_KEY;
      vi.restoreAllMocks();
    });

    it('returns null for non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 })
      );

      const result = await runLighthouseAudit('https://example.com');
      expect(result).toBeNull();
    });

    it('returns null for 403 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 })
      );

      const result = await runLighthouseAudit('https://example.com');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('Network unreachable')
      );

      const result = await runLighthouseAudit('https://example.com');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // runAxeAudit — with mocked fetch (successful response)
  // ===========================================================================

  describe('runAxeAudit — successful response', () => {
    beforeEach(() => {
      process.env.BROWSERLESS_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.BROWSERLESS_API_KEY;
      vi.restoreAllMocks();
    });

    it('maps violations correctly from the response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            violations: [
              {
                id: 'color-contrast',
                description: 'Elements must have sufficient color contrast',
                impact: 'serious',
                helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/color-contrast',
                nodes: [{ html: '<p>low contrast</p>' }, { html: '<span>also bad</span>' }],
              },
              {
                id: 'image-alt',
                description: 'Images must have alternate text',
                impact: 'critical',
                helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/image-alt',
                nodes: [{ html: '<img src="photo.jpg">' }],
              },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await runAxeAudit('https://example.com');
      expect(result).toHaveLength(2);

      expect(result[0].id).toBe('color-contrast');
      expect(result[0].description).toBe('Elements must have sufficient color contrast');
      expect(result[0].impact).toBe('serious');
      expect(result[0].nodes).toBe(2);

      expect(result[1].id).toBe('image-alt');
      expect(result[1].impact).toBe('critical');
      expect(result[1].nodes).toBe(1);
    });

    it('returns empty array when no violations exist', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ violations: [] }), { status: 200 })
      );

      const result = await runAxeAudit('https://example.com');
      expect(result).toEqual([]);
    });

    it('defaults impact to moderate when not provided', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            violations: [
              {
                id: 'test-rule',
                description: 'A test rule',
                // no impact field
                helpUrl: '',
                nodes: [],
              },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await runAxeAudit('https://example.com');
      expect(result[0].impact).toBe('moderate');
    });

    it('defaults nodes to 0 when nodes array is missing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            violations: [
              {
                id: 'test-rule',
                description: 'A test rule',
                impact: 'minor',
                // no nodes
              },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await runAxeAudit('https://example.com');
      expect(result[0].nodes).toBe(0);
    });
  });

  // ===========================================================================
  // runAxeAudit — error handling
  // ===========================================================================

  describe('runAxeAudit — error handling', () => {
    beforeEach(() => {
      process.env.BROWSERLESS_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.BROWSERLESS_API_KEY;
      vi.restoreAllMocks();
    });

    it('returns empty array for non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Bad Request', { status: 400 })
      );

      const result = await runAxeAudit('https://example.com');
      expect(result).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
        new Error('ECONNREFUSED')
      );

      const result = await runAxeAudit('https://example.com');
      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // runFullAudit — integration of both audit types
  // ===========================================================================

  describe('runFullAudit — with mocked fetch', () => {
    beforeEach(() => {
      process.env.BROWSERLESS_API_KEY = 'test-key';
    });

    afterEach(() => {
      delete process.env.BROWSERLESS_API_KEY;
      vi.restoreAllMocks();
    });

    it('returns combined result with scores and violations', async () => {
      // runFullAudit calls fetch twice in parallel (lighthouse + axe)
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      // First call: lighthouse performance endpoint
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            lighthouse: {
              performance: 0.95,
              accessibility: 0.88,
              'best-practices': 0.92,
              seo: 1.0,
            },
          }),
          { status: 200 }
        )
      );

      // Second call: axe function endpoint
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            violations: [
              {
                id: 'label',
                description: 'Form elements must have labels',
                impact: 'critical',
                helpUrl: 'https://example.com',
                nodes: [{ html: '<input />' }],
              },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await runFullAudit('https://example.com');

      expect(result.lighthouseScores).not.toBeNull();
      expect(result.lighthouseScores!.performance).toBe(95);
      expect(result.axeViolations).toHaveLength(1);
      expect(result.axeViolations[0].id).toBe('label');
      expect(result.performanceMetrics).toEqual({
        load_time_ms: 0,
        first_paint_ms: 0,
        dom_content_loaded_ms: 0,
      });
    });

    it('performanceMetrics always has default zeros', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        new Response(JSON.stringify({}), { status: 200 })
      );

      const result = await runFullAudit('https://example.com');
      expect(result.performanceMetrics.load_time_ms).toBe(0);
      expect(result.performanceMetrics.first_paint_ms).toBe(0);
      expect(result.performanceMetrics.dom_content_loaded_ms).toBe(0);
    });
  });
});
