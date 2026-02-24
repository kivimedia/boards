import type { QAPerformanceMetrics, WCAGCriterion, WCAGReport } from '../types';

export interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

export interface AxeViolation {
  id: string;
  description: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  helpUrl: string;
  nodes: number;
}

export interface AuditResult {
  lighthouseScores: LighthouseScores | null;
  axeViolations: AxeViolation[];
  performanceMetrics: QAPerformanceMetrics;
}

/**
 * Run Lighthouse audit via Browserless.io.
 * Falls back gracefully if not available
 */
export async function runLighthouseAudit(url: string): Promise<LighthouseScores | null> {
  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  if (!browserlessKey) return null;

  try {
    // Use Browserless performance endpoint
    const response = await fetch(
      `https://chrome.browserless.io/performance?token=${browserlessKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();

    return {
      performance: Math.round((data.lighthouse?.performance ?? data.performanceScore ?? 0) * 100),
      accessibility: Math.round((data.lighthouse?.accessibility ?? 0) * 100),
      bestPractices: Math.round((data.lighthouse?.['best-practices'] ?? 0) * 100),
      seo: Math.round((data.lighthouse?.seo ?? 0) * 100),
    };
  } catch (err) {
    console.error('[LighthouseAudit] Failed:', err);
    return null;
  }
}

/**
 * Run axe-core accessibility audit via Browserless.io.
 * Injects axe-core into the page and captures violations
 */
export async function runAxeAudit(url: string): Promise<AxeViolation[]> {
  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  if (!browserlessKey) return [];

  try {
    const response = await fetch(
      `https://chrome.browserless.io/function?token=${browserlessKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: `
            module.exports = async ({ page }) => {
              await page.goto('${url}', { waitUntil: 'networkidle0', timeout: 30000 });
              await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.9.1/axe.min.js' });
              const results = await page.evaluate(() => {
                return new Promise((resolve) => {
                  window.axe.run().then(resolve);
                });
              });
              return results;
            };
          `,
        }),
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const violations = (data.violations || []).map((v: any) => ({
      id: v.id,
      description: v.description,
      impact: v.impact || 'moderate',
      helpUrl: v.helpUrl || '',
      nodes: v.nodes?.length || 0,
    }));

    return violations;
  } catch (err) {
    console.error('[AxeAudit] Failed:', err);
    return [];
  }
}

/**
 * Run full audit pipeline: Lighthouse + axe-core
 */
export async function runFullAudit(url: string): Promise<AuditResult> {
  const [lighthouseScores, axeViolations] = await Promise.all([
    runLighthouseAudit(url),
    runAxeAudit(url),
  ]);

  return {
    lighthouseScores,
    axeViolations,
    performanceMetrics: {
      load_time_ms: 0,
      first_paint_ms: 0,
      dom_content_loaded_ms: 0,
    },
  };
}

// ============================================================================
// WCAG 2.1 AA COMPLIANCE MAPPING
// ============================================================================

/**
 * Known axe-core rule ID to WCAG 2.1 success criterion mapping.
 * This covers the most common rules; unmapped rules fall under 'robust'.
 */
const AXE_TO_WCAG: Record<string, { criterion: string; name: string; level: 'A' | 'AA' | 'AAA'; principle: WCAGCriterion['principle'] }> = {
  'color-contrast': { criterion: '1.4.3', name: 'Contrast (Minimum)', level: 'AA', principle: 'perceivable' },
  'image-alt': { criterion: '1.1.1', name: 'Non-text Content', level: 'A', principle: 'perceivable' },
  'input-image-alt': { criterion: '1.1.1', name: 'Non-text Content', level: 'A', principle: 'perceivable' },
  'area-alt': { criterion: '1.1.1', name: 'Non-text Content', level: 'A', principle: 'perceivable' },
  'object-alt': { criterion: '1.1.1', name: 'Non-text Content', level: 'A', principle: 'perceivable' },
  'video-caption': { criterion: '1.2.2', name: 'Captions (Prerecorded)', level: 'A', principle: 'perceivable' },
  'audio-caption': { criterion: '1.2.1', name: 'Audio-only and Video-only', level: 'A', principle: 'perceivable' },
  'td-headers-attr': { criterion: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'perceivable' },
  'th-has-data-cells': { criterion: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'perceivable' },
  'list': { criterion: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'perceivable' },
  'listitem': { criterion: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'perceivable' },
  'definition-list': { criterion: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'perceivable' },
  'dlitem': { criterion: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'perceivable' },
  'label': { criterion: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'perceivable' },
  'landmark-one-main': { criterion: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'perceivable' },
  'page-has-heading-one': { criterion: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'perceivable' },
  'heading-order': { criterion: '1.3.1', name: 'Info and Relationships', level: 'A', principle: 'perceivable' },
  'color-contrast-enhanced': { criterion: '1.4.6', name: 'Contrast (Enhanced)', level: 'AAA', principle: 'perceivable' },
  'meta-viewport': { criterion: '1.4.4', name: 'Resize text', level: 'AA', principle: 'perceivable' },
  'meta-viewport-large': { criterion: '1.4.10', name: 'Reflow', level: 'AA', principle: 'perceivable' },
  'link-name': { criterion: '2.4.4', name: 'Link Purpose (In Context)', level: 'A', principle: 'operable' },
  'button-name': { criterion: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
  'document-title': { criterion: '2.4.2', name: 'Page Titled', level: 'A', principle: 'operable' },
  'bypass': { criterion: '2.4.1', name: 'Bypass Blocks', level: 'A', principle: 'operable' },
  'frame-title': { criterion: '2.4.1', name: 'Bypass Blocks', level: 'A', principle: 'operable' },
  'tabindex': { criterion: '2.4.3', name: 'Focus Order', level: 'A', principle: 'operable' },
  'focus-order-semantics': { criterion: '2.4.3', name: 'Focus Order', level: 'A', principle: 'operable' },
  'accesskeys': { criterion: '2.4.1', name: 'Bypass Blocks', level: 'A', principle: 'operable' },
  'duplicate-id': { criterion: '4.1.1', name: 'Parsing', level: 'A', principle: 'robust' },
  'duplicate-id-active': { criterion: '4.1.1', name: 'Parsing', level: 'A', principle: 'robust' },
  'duplicate-id-aria': { criterion: '4.1.1', name: 'Parsing', level: 'A', principle: 'robust' },
  'aria-allowed-attr': { criterion: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
  'aria-hidden-body': { criterion: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
  'aria-hidden-focus': { criterion: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
  'aria-required-attr': { criterion: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
  'aria-required-children': { criterion: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
  'aria-required-parent': { criterion: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
  'aria-roles': { criterion: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
  'aria-valid-attr': { criterion: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
  'aria-valid-attr-value': { criterion: '4.1.2', name: 'Name, Role, Value', level: 'A', principle: 'robust' },
  'html-has-lang': { criterion: '3.1.1', name: 'Language of Page', level: 'A', principle: 'understandable' },
  'html-lang-valid': { criterion: '3.1.1', name: 'Language of Page', level: 'A', principle: 'understandable' },
  'valid-lang': { criterion: '3.1.2', name: 'Language of Parts', level: 'AA', principle: 'understandable' },
  'form-field-multiple-labels': { criterion: '3.3.2', name: 'Labels or Instructions', level: 'A', principle: 'understandable' },
};

/**
 * Map axe-core violations to a structured WCAG 2.1 AA compliance report.
 */
export function mapAxeToWCAG(violations: AxeViolation[]): WCAGReport {
  const principles = {
    perceivable: { passed: 0, failed: 0, total: 0 },
    operable: { passed: 0, failed: 0, total: 0 },
    understandable: { passed: 0, failed: 0, total: 0 },
    robust: { passed: 0, failed: 0, total: 0 },
  };

  // Track which criteria we've seen violations for
  const criteriaMap = new Map<string, WCAGCriterion>();
  let totalViolations = 0;

  for (const violation of violations) {
    const mapping = AXE_TO_WCAG[violation.id];
    const principle = mapping?.principle ?? 'robust';
    const criterion = mapping?.criterion ?? violation.id;
    const name = mapping?.name ?? violation.description;
    const level = mapping?.level ?? 'A';

    totalViolations += violation.nodes;

    if (!criteriaMap.has(criterion)) {
      criteriaMap.set(criterion, {
        id: criterion,
        name,
        level: level as 'A' | 'AA' | 'AAA',
        principle,
        passed: false,
        violations: violation.nodes,
        description: violation.description,
      });
    } else {
      const existing = criteriaMap.get(criterion)!;
      existing.violations += violation.nodes;
    }
  }

  // Count principle failures
  const criteriaArray = Array.from(criteriaMap.values());
  for (const c of criteriaArray) {
    const p = c.principle as keyof typeof principles;
    principles[p].failed++;
    principles[p].total++;
  }

  // Add approximate passed counts from known criteria pool
  const KNOWN_CRITERIA_COUNT: Record<string, number> = {
    perceivable: 29,
    operable: 29,
    understandable: 17,
    robust: 3,
  };

  for (const [principle, stats] of Object.entries(principles)) {
    const knownTotal = KNOWN_CRITERIA_COUNT[principle] || stats.total;
    stats.passed = Math.max(0, knownTotal - stats.failed);
    stats.total = knownTotal;
  }

  const totalCriteria = Object.values(principles).reduce((sum, p) => sum + p.total, 0);
  const totalPassed = Object.values(principles).reduce((sum, p) => sum + p.passed, 0);
  const compliancePercentage = totalCriteria > 0
    ? Math.round((totalPassed / totalCriteria) * 100)
    : 100;

  return {
    compliancePercentage,
    principles,
    criteria: Array.from(criteriaMap.values()),
    totalViolations,
  };
}

/**
 * Compute score regression between two Lighthouse score objects.
 * Returns a record of categories that regressed by more than the threshold.
 */
export function detectScoreRegression(
  current: LighthouseScores,
  previous: LighthouseScores,
  threshold: number = 10
): Record<string, { current: number; previous: number; drop: number }> {
  const regressions: Record<string, { current: number; previous: number; drop: number }> = {};

  const categories: (keyof LighthouseScores)[] = ['performance', 'accessibility', 'bestPractices', 'seo'];
  for (const cat of categories) {
    const drop = previous[cat] - current[cat];
    if (drop > threshold) {
      regressions[cat] = {
        current: current[cat],
        previous: previous[cat],
        drop,
      };
    }
  }

  return regressions;
}
