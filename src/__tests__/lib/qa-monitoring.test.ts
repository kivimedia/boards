import { describe, it, expect } from 'vitest';
import { mapAxeToWCAG, detectScoreRegression } from '@/lib/ai/lighthouse-audit';
import type { AxeViolation, LighthouseScores } from '@/lib/ai/lighthouse-audit';
import { computeScreenshotDiff, parseQAResponse, countFindings, scoreToStatus } from '@/lib/ai/dev-qa';
import { runDataToCSV } from '@/components/qa/QATrendDashboard';

// ============================================================================
// mapAxeToWCAG
// ============================================================================

describe('mapAxeToWCAG', () => {
  it('returns 100% compliance with no violations', () => {
    const report = mapAxeToWCAG([]);
    expect(report.compliancePercentage).toBe(100);
    expect(report.totalViolations).toBe(0);
    expect(report.criteria).toHaveLength(0);
  });

  it('maps color-contrast to perceivable principle', () => {
    const violations: AxeViolation[] = [
      { id: 'color-contrast', description: 'Elements must have sufficient color contrast', impact: 'serious', helpUrl: '', nodes: 5 },
    ];
    const report = mapAxeToWCAG(violations);
    expect(report.criteria[0].principle).toBe('perceivable');
    expect(report.criteria[0].id).toBe('1.4.3');
    expect(report.criteria[0].violations).toBe(5);
    expect(report.totalViolations).toBe(5);
  });

  it('maps image-alt to perceivable principle', () => {
    const violations: AxeViolation[] = [
      { id: 'image-alt', description: 'Images must have alt text', impact: 'critical', helpUrl: '', nodes: 3 },
    ];
    const report = mapAxeToWCAG(violations);
    expect(report.criteria[0].principle).toBe('perceivable');
    expect(report.criteria[0].id).toBe('1.1.1');
  });

  it('maps link-name to operable principle', () => {
    const violations: AxeViolation[] = [
      { id: 'link-name', description: 'Links must have discernible text', impact: 'serious', helpUrl: '', nodes: 2 },
    ];
    const report = mapAxeToWCAG(violations);
    expect(report.criteria[0].principle).toBe('operable');
  });

  it('maps html-has-lang to understandable principle', () => {
    const violations: AxeViolation[] = [
      { id: 'html-has-lang', description: 'html element must have a lang attribute', impact: 'serious', helpUrl: '', nodes: 1 },
    ];
    const report = mapAxeToWCAG(violations);
    expect(report.criteria[0].principle).toBe('understandable');
  });

  it('maps aria rules to robust principle', () => {
    const violations: AxeViolation[] = [
      { id: 'aria-roles', description: 'ARIA roles must be valid', impact: 'critical', helpUrl: '', nodes: 2 },
    ];
    const report = mapAxeToWCAG(violations);
    expect(report.criteria[0].principle).toBe('robust');
  });

  it('aggregates multiple violations for same criterion', () => {
    const violations: AxeViolation[] = [
      { id: 'image-alt', description: 'Missing alt', impact: 'critical', helpUrl: '', nodes: 3 },
      { id: 'input-image-alt', description: 'Input image missing alt', impact: 'critical', helpUrl: '', nodes: 2 },
    ];
    const report = mapAxeToWCAG(violations);
    // Both map to 1.1.1, so should be aggregated
    const criterion = report.criteria.find((c) => c.id === '1.1.1');
    expect(criterion).toBeDefined();
    expect(criterion!.violations).toBe(5);
  });

  it('handles unknown axe rules as robust', () => {
    const violations: AxeViolation[] = [
      { id: 'custom-rule-xyz', description: 'Custom check', impact: 'moderate', helpUrl: '', nodes: 1 },
    ];
    const report = mapAxeToWCAG(violations);
    expect(report.criteria[0].principle).toBe('robust');
  });

  it('reduces compliance percentage with violations', () => {
    const violations: AxeViolation[] = [
      { id: 'color-contrast', description: 'Color contrast', impact: 'serious', helpUrl: '', nodes: 10 },
      { id: 'image-alt', description: 'Alt text', impact: 'critical', helpUrl: '', nodes: 5 },
      { id: 'link-name', description: 'Link text', impact: 'serious', helpUrl: '', nodes: 3 },
    ];
    const report = mapAxeToWCAG(violations);
    expect(report.compliancePercentage).toBeLessThan(100);
    expect(report.compliancePercentage).toBeGreaterThan(0);
  });
});

// ============================================================================
// detectScoreRegression
// ============================================================================

describe('detectScoreRegression', () => {
  it('returns empty when no regression', () => {
    const current: LighthouseScores = { performance: 90, accessibility: 95, bestPractices: 90, seo: 85 };
    const previous: LighthouseScores = { performance: 85, accessibility: 90, bestPractices: 85, seo: 80 };
    const result = detectScoreRegression(current, previous);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('detects regression above threshold', () => {
    const current: LighthouseScores = { performance: 60, accessibility: 95, bestPractices: 90, seo: 85 };
    const previous: LighthouseScores = { performance: 90, accessibility: 95, bestPractices: 90, seo: 85 };
    const result = detectScoreRegression(current, previous, 10);
    expect(result.performance).toBeDefined();
    expect(result.performance.drop).toBe(30);
    expect(result.performance.current).toBe(60);
    expect(result.performance.previous).toBe(90);
  });

  it('uses custom threshold', () => {
    const current: LighthouseScores = { performance: 85, accessibility: 95, bestPractices: 90, seo: 85 };
    const previous: LighthouseScores = { performance: 90, accessibility: 95, bestPractices: 90, seo: 85 };
    // 5 point drop, threshold is 3
    const result = detectScoreRegression(current, previous, 3);
    expect(result.performance).toBeDefined();
    expect(result.performance.drop).toBe(5);
  });

  it('detects multiple regressions', () => {
    const current: LighthouseScores = { performance: 50, accessibility: 60, bestPractices: 40, seo: 85 };
    const previous: LighthouseScores = { performance: 90, accessibility: 95, bestPractices: 90, seo: 85 };
    const result = detectScoreRegression(current, previous, 10);
    expect(Object.keys(result)).toHaveLength(3);
    expect(result.performance).toBeDefined();
    expect(result.accessibility).toBeDefined();
    expect(result.bestPractices).toBeDefined();
    expect(result.seo).toBeUndefined();
  });

  it('ignores improvements (not regressions)', () => {
    const current: LighthouseScores = { performance: 95, accessibility: 95, bestPractices: 90, seo: 85 };
    const previous: LighthouseScores = { performance: 50, accessibility: 50, bestPractices: 50, seo: 50 };
    const result = detectScoreRegression(current, previous);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ============================================================================
// computeScreenshotDiff
// ============================================================================

describe('computeScreenshotDiff', () => {
  it('returns 0% diff for identical empty buffers', () => {
    const result = computeScreenshotDiff(Buffer.alloc(0), Buffer.alloc(0), 'desktop');
    expect(result.diffPercentage).toBe(0);
    expect(result.viewport).toBe('desktop');
  });

  it('returns 100% diff when one buffer is empty', () => {
    const result = computeScreenshotDiff(Buffer.from('data'), Buffer.alloc(0), 'mobile');
    expect(result.diffPercentage).toBe(100);
  });

  it('returns low diff for similar-sized buffers', () => {
    const a = Buffer.alloc(1000, 'a');
    const b = Buffer.alloc(1010, 'b');
    const result = computeScreenshotDiff(a, b, 'tablet');
    expect(result.diffPercentage).toBeLessThan(5);
  });

  it('returns high diff for very different-sized buffers', () => {
    const a = Buffer.alloc(100, 'a');
    const b = Buffer.alloc(1000, 'b');
    const result = computeScreenshotDiff(a, b, 'desktop');
    expect(result.diffPercentage).toBeGreaterThan(50);
  });
});

// ============================================================================
// QA Response Parsing (existing, verify not broken)
// ============================================================================

describe('parseQAResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      findings: [
        { severity: 'critical', category: 'layout', description: 'Broken layout', location: 'header' },
      ],
      checklist_results: [{ index: 1, passed: true, notes: 'OK' }],
      overall_score: 85,
      summary: 'Minor issues found',
    });
    const result = parseQAResponse(json, 1);
    expect(result.findings).toHaveLength(1);
    expect(result.overallScore).toBe(85);
    expect(result.summary).toBe('Minor issues found');
  });

  it('handles malformed JSON', () => {
    const result = parseQAResponse('not valid json', 0);
    expect(result.findings).toEqual([]);
    expect(result.overallScore).toBe(0);
  });

  it('clamps score to 0-100 range', () => {
    const json = JSON.stringify({ findings: [], checklist_results: [], overall_score: 150, summary: '' });
    const result = parseQAResponse(json, 0);
    expect(result.overallScore).toBe(100);
  });
});

// ============================================================================
// countFindings
// ============================================================================

describe('countFindings', () => {
  it('counts by severity', () => {
    const findings = [
      { severity: 'critical' as const, category: '', description: '', location: '' },
      { severity: 'major' as const, category: '', description: '', location: '' },
      { severity: 'major' as const, category: '', description: '', location: '' },
      { severity: 'minor' as const, category: '', description: '', location: '' },
      { severity: 'info' as const, category: '', description: '', location: '' },
    ];
    const counts = countFindings(findings);
    expect(counts.critical).toBe(1);
    expect(counts.major).toBe(2);
    expect(counts.minor).toBe(1);
    expect(counts.info).toBe(1);
  });

  it('returns zeros for empty findings', () => {
    const counts = countFindings([]);
    expect(counts).toEqual({ critical: 0, major: 0, minor: 0, info: 0 });
  });
});

// ============================================================================
// scoreToStatus
// ============================================================================

describe('scoreToStatus', () => {
  it('returns passed for score >= 70', () => {
    expect(scoreToStatus(70)).toBe('passed');
    expect(scoreToStatus(100)).toBe('passed');
  });

  it('returns failed for score < 70', () => {
    expect(scoreToStatus(69)).toBe('failed');
    expect(scoreToStatus(0)).toBe('failed');
  });
});

// ============================================================================
// runDataToCSV
// ============================================================================

describe('runDataToCSV', () => {
  it('generates CSV with headers', () => {
    const csv = runDataToCSV([]);
    expect(csv).toContain('Date,Performance,Accessibility');
  });

  it('includes all run data', () => {
    const csv = runDataToCSV([
      { id: '1', date: '2026-01-01', performance: 90, accessibility: 85, bestPractices: 80, seo: 75, brokenLinks: 2, totalLinks: 50, wcagCompliance: 95 },
    ]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('2026-01-01');
    expect(lines[1]).toContain('90');
  });

  it('handles null wcagCompliance', () => {
    const csv = runDataToCSV([
      { id: '1', date: '2026-01-01', performance: 90, accessibility: 85, bestPractices: 80, seo: 75, brokenLinks: 0, totalLinks: 10, wcagCompliance: null },
    ]);
    expect(csv).toBeDefined();
    // Last field is empty (null wcagCompliance), so line ends with trailing comma
    const dataLine = csv.split('\n')[1];
    expect(dataLine.endsWith(',')).toBe(true);
  });
});
