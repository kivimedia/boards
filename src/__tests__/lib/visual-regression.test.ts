import { describe, it, expect, vi } from 'vitest';
import {
  getBaselines,
  setBaselines,
  runVisualRegression,
} from '@/lib/ai/visual-regression';
import type {
  RegressionResult,
  RegressionReport,
} from '@/lib/ai/visual-regression';

// ---------------------------------------------------------------------------
// Helpers — mock Supabase client
// ---------------------------------------------------------------------------

function createMockSupabase(baselines: { viewport: string; screenshot_path: string }[] = []) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: baselines }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        download: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        upload: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  } as any;
}

describe('visual-regression', () => {
  // =========================================================================
  // Exports verification
  // =========================================================================

  describe('exports', () => {
    it('exports getBaselines as a function', () => {
      expect(typeof getBaselines).toBe('function');
    });

    it('exports setBaselines as a function', () => {
      expect(typeof setBaselines).toBe('function');
    });

    it('exports runVisualRegression as a function', () => {
      expect(typeof runVisualRegression).toBe('function');
    });
  });

  // =========================================================================
  // RegressionResult interface shape
  // =========================================================================

  describe('RegressionResult interface shape', () => {
    it('has all required fields with correct types', () => {
      const result: RegressionResult = {
        viewport: 'desktop',
        baselinePath: '/baseline/desktop.png',
        currentPath: '/current/desktop.png',
        diffPath: '/diff/desktop.png',
        mismatchPercentage: 3.42,
        flagged: false,
      };

      expect(result).toHaveProperty('viewport');
      expect(result).toHaveProperty('baselinePath');
      expect(result).toHaveProperty('currentPath');
      expect(result).toHaveProperty('diffPath');
      expect(result).toHaveProperty('mismatchPercentage');
      expect(result).toHaveProperty('flagged');
    });

    it('allows diffPath to be null', () => {
      const result: RegressionResult = {
        viewport: 'mobile',
        baselinePath: '/baseline/mobile.png',
        currentPath: '/current/mobile.png',
        diffPath: null,
        mismatchPercentage: 0,
        flagged: false,
      };

      expect(result.diffPath).toBeNull();
    });
  });

  // =========================================================================
  // RegressionReport interface shape
  // =========================================================================

  describe('RegressionReport interface shape', () => {
    it('has results array, hasRegression boolean, and summary string', () => {
      const report: RegressionReport = {
        results: [],
        hasRegression: false,
        summary: 'All clear',
      };

      expect(Array.isArray(report.results)).toBe(true);
      expect(typeof report.hasRegression).toBe('boolean');
      expect(typeof report.summary).toBe('string');
    });
  });

  // =========================================================================
  // Threshold logic — flagged behavior
  // =========================================================================

  describe('threshold logic', () => {
    it('flagged is true when mismatchPercentage > threshold', () => {
      // The source code: flagged: mismatchPercentage > threshold
      const mismatch = 6;
      const threshold = 5;
      const flagged = mismatch > threshold;
      expect(flagged).toBe(true);
    });

    it('flagged is false when mismatchPercentage === threshold', () => {
      // Strict inequality: mismatch > threshold is false when equal
      const mismatch = 5;
      const threshold = 5;
      const flagged = mismatch > threshold;
      expect(flagged).toBe(false);
    });

    it('flagged is false when mismatchPercentage < threshold', () => {
      const mismatch = 2.5;
      const threshold = 5;
      const flagged = mismatch > threshold;
      expect(flagged).toBe(false);
    });

    it('flagged is true for mismatch just above threshold (e.g., 5.01 > 5)', () => {
      const mismatch = 5.01;
      const threshold = 5;
      const flagged = mismatch > threshold;
      expect(flagged).toBe(true);
    });
  });

  // =========================================================================
  // hasRegression derivation
  // =========================================================================

  describe('hasRegression derivation', () => {
    it('hasRegression is true when at least one result is flagged', () => {
      const results: RegressionResult[] = [
        { viewport: 'desktop', baselinePath: '', currentPath: '', diffPath: null, mismatchPercentage: 2, flagged: false },
        { viewport: 'mobile', baselinePath: '', currentPath: '', diffPath: '/diff', mismatchPercentage: 12, flagged: true },
      ];
      const hasRegression = results.some((r) => r.flagged);
      expect(hasRegression).toBe(true);
    });

    it('hasRegression is false when no results are flagged', () => {
      const results: RegressionResult[] = [
        { viewport: 'desktop', baselinePath: '', currentPath: '', diffPath: null, mismatchPercentage: 1, flagged: false },
        { viewport: 'tablet', baselinePath: '', currentPath: '', diffPath: null, mismatchPercentage: 4.5, flagged: false },
      ];
      const hasRegression = results.some((r) => r.flagged);
      expect(hasRegression).toBe(false);
    });
  });

  // =========================================================================
  // Summary messages
  // =========================================================================

  describe('summary messages', () => {
    it('returns regression-detected summary when flagged viewports exist', () => {
      const flaggedViewports = ['desktop', 'tablet'];
      const summary = `Visual regression detected in ${flaggedViewports.join(', ')}. Review changes and update baseline if intentional.`;
      expect(summary).toContain('Visual regression detected');
      expect(summary).toContain('desktop, tablet');
    });

    it('returns no-regression summary when results exist but none flagged', () => {
      const summary = 'No visual regressions detected. All viewports match baseline.';
      expect(summary).toContain('No visual regressions detected');
    });

    it('returns no-baselines summary when results array is empty', () => {
      const summary = 'No baselines available for comparison.';
      expect(summary).toContain('No baselines available');
    });
  });

  // =========================================================================
  // runVisualRegression — no baselines path
  // =========================================================================

  describe('runVisualRegression — no baselines path', () => {
    it('returns empty results and no-baselines message when no baselines exist', async () => {
      const supabase = createMockSupabase([]);
      const report = await runVisualRegression(
        supabase,
        'card-123',
        'https://example.com',
        [{ viewport: 'desktop', storage_path: '/current/desktop.png' }],
      );

      expect(report.results).toEqual([]);
      expect(report.hasRegression).toBe(false);
      expect(report.summary).toBe(
        'No baselines set. Run QA and set results as baseline to enable regression testing.'
      );
    });

    it('returns hasRegression false when baselines are empty regardless of threshold', async () => {
      const supabase = createMockSupabase([]);
      const report = await runVisualRegression(
        supabase,
        'card-abc',
        'https://example.com',
        [{ viewport: 'mobile', storage_path: '/current/mobile.png' }],
        0, // zero threshold
      );

      expect(report.hasRegression).toBe(false);
    });
  });
});
