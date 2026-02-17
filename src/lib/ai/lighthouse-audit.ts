import type { QAPerformanceMetrics } from '../types';

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
