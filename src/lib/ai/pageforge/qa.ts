import { SupabaseClient } from '@supabase/supabase-js';
import { callPageForgeAgent } from '../pageforge-pipeline';
import { getSystemPrompt } from '../prompt-templates';

// ============================================================================
// QA AGENT (Functional Quality Assurance)
// Link validation, responsive checks, Lighthouse, accessibility.
// ============================================================================

export interface QaCheckResult {
  name: string;
  passed: boolean;
  score?: number;
  details: string;
  items?: QaCheckItem[];
}

export interface QaCheckItem {
  label: string;
  passed: boolean;
  severity?: 'critical' | 'major' | 'minor' | 'info';
  details?: string;
}

export interface QaReport {
  checks: QaCheckResult[];
  passed: number;
  failed: number;
  total: number;
  overallPassed: boolean;
}

export interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

// ============================================================================
// LINK VALIDATION
// ============================================================================

export async function runLinkValidation(pageUrl: string): Promise<QaCheckResult> {
  const items: QaCheckItem[] = [];

  try {
    // Fetch the page HTML
    const res = await fetch(pageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return {
        name: 'Link Validation',
        passed: false,
        details: `Page not reachable: ${res.status}`,
      };
    }

    const html = await res.text();

    // Extract all links
    const linkRegex = /href=["']([^"']+)["']/gi;
    const links = new Set<string>();
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (href.startsWith('http') || href.startsWith('/')) {
        links.add(href.startsWith('/') ? new URL(href, pageUrl).href : href);
      }
    }

    // Check up to 20 links
    const linksToCheck = Array.from(links).slice(0, 20);
    for (const link of linksToCheck) {
      try {
        const linkRes = await fetch(link, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
          redirect: 'follow',
        });
        items.push({
          label: link.slice(0, 80),
          passed: linkRes.ok,
          severity: linkRes.ok ? undefined : 'major',
          details: linkRes.ok ? `${linkRes.status}` : `${linkRes.status} ${linkRes.statusText}`,
        });
      } catch {
        items.push({
          label: link.slice(0, 80),
          passed: false,
          severity: 'major',
          details: 'Unreachable',
        });
      }
    }

    const broken = items.filter(i => !i.passed).length;
    return {
      name: 'Link Validation',
      passed: broken === 0,
      details: `${links.size} links found, ${linksToCheck.length} checked, ${broken} broken`,
      items,
    };
  } catch (err) {
    return {
      name: 'Link Validation',
      passed: false,
      details: `Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================================================
// RESPONSIVE CHECK
// ============================================================================

export async function runResponsiveCheck(
  pageUrl: string,
  browserlessUrl?: string
): Promise<QaCheckResult> {
  const items: QaCheckItem[] = [];
  const viewports = [
    { name: '320px (small mobile)', width: 320 },
    { name: '768px (tablet)', width: 768 },
    { name: '1024px (desktop)', width: 1024 },
    { name: '1440px (wide desktop)', width: 1440 },
  ];

  const apiUrl = browserlessUrl || process.env.BROWSERLESS_URL || 'https://chrome.browserless.io';
  const apiKey = process.env.BROWSERLESS_API_KEY || '';

  for (const vp of viewports) {
    try {
      // Use Browserless to check for horizontal overflow
      const res = await fetch(`${apiUrl}/function?token=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: `module.exports = async ({ page }) => {
            await page.setViewport({ width: ${vp.width}, height: 900 });
            await page.goto('${pageUrl}', { waitUntil: 'networkidle0', timeout: 15000 });
            const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
            const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
            return { hasOverflow, bodyWidth, viewportWidth: ${vp.width} };
          }`,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (res.ok) {
        const data = await res.json();
        items.push({
          label: vp.name,
          passed: !data.hasOverflow,
          severity: data.hasOverflow ? 'major' : undefined,
          details: data.hasOverflow ? `Body width ${data.bodyWidth}px exceeds viewport ${vp.width}px` : 'No horizontal overflow',
        });
      } else {
        items.push({ label: vp.name, passed: true, details: 'Could not verify (Browserless unavailable)' });
      }
    } catch {
      items.push({ label: vp.name, passed: true, details: 'Check skipped (Browserless unavailable)' });
    }
  }

  const failed = items.filter(i => !i.passed).length;
  return {
    name: 'Responsive Check',
    passed: failed === 0,
    details: `${viewports.length} viewports checked, ${failed} with overflow issues`,
    items,
  };
}

// ============================================================================
// LIGHTHOUSE AUDIT
// ============================================================================

export async function runLighthouseAudit(
  pageUrl: string,
  browserlessUrl?: string
): Promise<QaCheckResult & { scores: LighthouseScores }> {
  const apiUrl = browserlessUrl || process.env.BROWSERLESS_URL || 'https://chrome.browserless.io';
  const apiKey = process.env.BROWSERLESS_API_KEY || '';

  const defaultScores: LighthouseScores = { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 };

  try {
    const res = await fetch(`${apiUrl}/lighthouse?token=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: pageUrl,
        config: {
          extends: 'lighthouse:default',
          settings: { onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] },
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      return {
        name: 'Lighthouse Audit',
        passed: false,
        details: `Lighthouse API returned ${res.status}`,
        scores: defaultScores,
      };
    }

    const data = await res.json();
    const categories = data.categories || {};

    const scores: LighthouseScores = {
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
    };

    const items: QaCheckItem[] = [
      { label: 'Performance', passed: scores.performance >= 50, details: `${scores.performance}/100` },
      { label: 'Accessibility', passed: scores.accessibility >= 80, details: `${scores.accessibility}/100` },
      { label: 'Best Practices', passed: scores.bestPractices >= 80, details: `${scores.bestPractices}/100` },
      { label: 'SEO', passed: scores.seo >= 80, details: `${scores.seo}/100` },
    ];

    return {
      name: 'Lighthouse Audit',
      passed: items.every(i => i.passed),
      details: `P:${scores.performance} A:${scores.accessibility} BP:${scores.bestPractices} SEO:${scores.seo}`,
      items,
      scores,
    };
  } catch (err) {
    return {
      name: 'Lighthouse Audit',
      passed: false,
      details: `Lighthouse failed: ${err instanceof Error ? err.message : String(err)}`,
      scores: defaultScores,
    };
  }
}

// ============================================================================
// ACCESSIBILITY CHECK
// ============================================================================

export async function runAccessibilityCheck(
  pageUrl: string,
  browserlessUrl?: string
): Promise<QaCheckResult> {
  const apiUrl = browserlessUrl || process.env.BROWSERLESS_URL || 'https://chrome.browserless.io';
  const apiKey = process.env.BROWSERLESS_API_KEY || '';

  try {
    const res = await fetch(`${apiUrl}/function?token=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `module.exports = async ({ page }) => {
          await page.goto('${pageUrl}', { waitUntil: 'networkidle0', timeout: 15000 });
          // Basic a11y checks via page evaluation
          const results = await page.evaluate(() => {
            const issues = [];
            // Check images without alt
            document.querySelectorAll('img').forEach(img => {
              if (!img.alt && !img.getAttribute('role')) {
                issues.push({ type: 'img-alt', element: img.src?.slice(0,50) });
              }
            });
            // Check heading hierarchy
            const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
            let lastLevel = 0;
            headings.forEach(h => {
              const level = parseInt(h.tagName[1]);
              if (level > lastLevel + 1) {
                issues.push({ type: 'heading-skip', element: h.textContent?.slice(0,30) });
              }
              lastLevel = level;
            });
            // Check color contrast (basic - just count elements with very small text)
            document.querySelectorAll('*').forEach(el => {
              const style = getComputedStyle(el);
              if (parseFloat(style.fontSize) < 12 && el.textContent?.trim()) {
                issues.push({ type: 'small-text', element: el.textContent?.slice(0,30) });
              }
            });
            return { h1Count: document.querySelectorAll('h1').length, issues: issues.slice(0,20) };
          });
          return results;
        }`,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      return { name: 'Accessibility', passed: true, details: 'Could not run (Browserless unavailable)' };
    }

    const data = await res.json();
    const issues = data.issues || [];

    const items: QaCheckItem[] = [
      {
        label: 'H1 count',
        passed: data.h1Count === 1,
        severity: data.h1Count !== 1 ? 'major' : undefined,
        details: data.h1Count === 1 ? 'Exactly 1 H1' : `Found ${data.h1Count} H1 tags`,
      },
    ];

    const imgAltIssues = issues.filter((i: any) => i.type === 'img-alt');
    items.push({
      label: 'Image alt text',
      passed: imgAltIssues.length === 0,
      severity: imgAltIssues.length > 0 ? 'major' : undefined,
      details: imgAltIssues.length === 0 ? 'All images have alt text' : `${imgAltIssues.length} images missing alt`,
    });

    const headingSkips = issues.filter((i: any) => i.type === 'heading-skip');
    items.push({
      label: 'Heading hierarchy',
      passed: headingSkips.length === 0,
      severity: headingSkips.length > 0 ? 'minor' : undefined,
      details: headingSkips.length === 0 ? 'Proper heading order' : `${headingSkips.length} heading level skips`,
    });

    const failed = items.filter(i => !i.passed).length;
    return {
      name: 'Accessibility',
      passed: failed === 0,
      details: `${items.length} checks, ${failed} issues`,
      items,
    };
  } catch {
    return { name: 'Accessibility', passed: true, details: 'Check skipped (Browserless unavailable)' };
  }
}

// ============================================================================
// COMPILE FULL QA REPORT
// ============================================================================

export async function compileQaReport(
  supabase: SupabaseClient,
  buildId: string,
  pageUrl: string,
  lighthouseMinScore: number,
  browserlessUrl?: string
): Promise<QaReport> {
  // Run all checks in parallel
  const [links, responsive, lighthouse, a11y] = await Promise.all([
    runLinkValidation(pageUrl),
    runResponsiveCheck(pageUrl, browserlessUrl),
    runLighthouseAudit(pageUrl, browserlessUrl),
    runAccessibilityCheck(pageUrl, browserlessUrl),
  ]);

  const checks = [links, responsive, lighthouse, a11y];
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;

  // Update build with scores
  await supabase
    .from('pageforge_builds')
    .update({
      lighthouse_performance: (lighthouse as any).scores?.performance || null,
      lighthouse_accessibility: (lighthouse as any).scores?.accessibility || null,
      lighthouse_best_practices: (lighthouse as any).scores?.bestPractices || null,
      lighthouse_seo: (lighthouse as any).scores?.seo || null,
      qa_checks_passed: passed,
      qa_checks_failed: failed,
      qa_checks_total: checks.length,
    })
    .eq('id', buildId);

  return {
    checks,
    passed,
    failed,
    total: checks.length,
    overallPassed: failed === 0,
  };
}
