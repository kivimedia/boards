import { SupabaseClient } from '@supabase/supabase-js';
import type { QALinkCheck } from '../types';

// ============================================================================
// LINK CHECKER
// ============================================================================

export interface LinkCheckInput {
  url: string;
  qaResultId?: string;
}

export interface LinkCheckResult {
  url: string;
  statusCode: number | null;
  responseTimeMs: number;
  linkType: 'internal' | 'external' | 'anchor' | 'mailto' | 'tel';
  isBroken: boolean;
  errorMessage: string | null;
}

export interface LinkCheckSummary {
  total: number;
  broken: number;
  redirects: number;
  slow: number;
  healthy: number;
  links: LinkCheckResult[];
}

const LINK_TIMEOUT_MS = 5000;
const SLOW_THRESHOLD_MS = 3000;
const MAX_LINKS_TO_CHECK = 100;

/**
 * Classify a URL into a link type.
 */
export function classifyLink(href: string, pageUrl: string): LinkCheckResult['linkType'] {
  if (!href || href.startsWith('#')) return 'anchor';
  if (href.startsWith('mailto:')) return 'mailto';
  if (href.startsWith('tel:')) return 'tel';

  try {
    const linkHost = new URL(href, pageUrl).hostname;
    const pageHost = new URL(pageUrl).hostname;
    return linkHost === pageHost ? 'internal' : 'external';
  } catch {
    return 'external';
  }
}

/**
 * Normalize a href into an absolute URL.
 */
export function normalizeUrl(href: string, baseUrl: string): string | null {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
    return null;
  }
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

/**
 * Extract all link hrefs from raw HTML.
 */
export function extractLinksFromHtml(html: string): string[] {
  const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
  const links: string[] = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    links.push(match[1]);
  }
  return Array.from(new Set(links)); // deduplicate
}

/**
 * Check a single link by making a HEAD request.
 */
export async function checkLink(
  href: string,
  pageUrl: string
): Promise<LinkCheckResult> {
  const linkType = classifyLink(href, pageUrl);

  // Skip non-http links
  if (linkType === 'anchor' || linkType === 'mailto' || linkType === 'tel') {
    return {
      url: href,
      statusCode: null,
      responseTimeMs: 0,
      linkType,
      isBroken: false,
      errorMessage: null,
    };
  }

  const absoluteUrl = normalizeUrl(href, pageUrl);
  if (!absoluteUrl) {
    return {
      url: href,
      statusCode: null,
      responseTimeMs: 0,
      linkType,
      isBroken: true,
      errorMessage: 'Invalid URL',
    };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LINK_TIMEOUT_MS);

    const response = await fetch(absoluteUrl, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'AgencyBoard-LinkChecker/1.0',
      },
    });

    clearTimeout(timeout);
    const responseTimeMs = Date.now() - start;

    // If HEAD fails with 405, retry with GET
    if (response.status === 405) {
      const getController = new AbortController();
      const getTimeout = setTimeout(() => getController.abort(), LINK_TIMEOUT_MS);

      const getResponse = await fetch(absoluteUrl, {
        method: 'GET',
        signal: getController.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'AgencyBoard-LinkChecker/1.0',
        },
      });

      clearTimeout(getTimeout);
      const getResponseTimeMs = Date.now() - start;

      return {
        url: absoluteUrl,
        statusCode: getResponse.status,
        responseTimeMs: getResponseTimeMs,
        linkType,
        isBroken: getResponse.status >= 400,
        errorMessage: getResponse.status >= 400 ? `HTTP ${getResponse.status}` : null,
      };
    }

    return {
      url: absoluteUrl,
      statusCode: response.status,
      responseTimeMs,
      linkType,
      isBroken: response.status >= 400,
      errorMessage: response.status >= 400 ? `HTTP ${response.status}` : null,
    };
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('abort') || message.includes('timeout');

    return {
      url: absoluteUrl || href,
      statusCode: null,
      responseTimeMs,
      linkType,
      isBroken: true,
      errorMessage: isTimeout ? 'Timeout (>5s)' : message,
    };
  }
}

/**
 * Fetch a page's HTML and extract+check all links.
 */
export async function checkPageLinks(
  pageUrl: string,
  html?: string
): Promise<LinkCheckSummary> {
  // If HTML not provided, fetch it
  let pageHtml = html;
  if (!pageHtml) {
    const browserlessKey = process.env.BROWSERLESS_API_KEY;
    if (browserlessKey) {
      try {
        const response = await fetch(
          `https://chrome.browserless.io/content?token=${browserlessKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: pageUrl, waitFor: 3000 }),
          }
        );
        if (response.ok) {
          pageHtml = await response.text();
        }
      } catch {
        // Fall back to direct fetch
      }
    }

    if (!pageHtml) {
      try {
        const response = await fetch(pageUrl, {
          headers: { 'User-Agent': 'AgencyBoard-LinkChecker/1.0' },
        });
        pageHtml = await response.text();
      } catch {
        return { total: 0, broken: 0, redirects: 0, slow: 0, healthy: 0, links: [] };
      }
    }
  }

  const hrefs = extractLinksFromHtml(pageHtml);
  const linksToCheck = hrefs.slice(0, MAX_LINKS_TO_CHECK);

  // Check all links in parallel (batches of 10)
  const results: LinkCheckResult[] = [];
  for (let i = 0; i < linksToCheck.length; i += 10) {
    const batch = linksToCheck.slice(i, i + 10);
    const batchResults = await Promise.all(
      batch.map((href) => checkLink(href, pageUrl))
    );
    results.push(...batchResults);
  }

  const summary: LinkCheckSummary = {
    total: results.length,
    broken: results.filter((r) => r.isBroken).length,
    redirects: results.filter((r) => r.statusCode && r.statusCode >= 300 && r.statusCode < 400).length,
    slow: results.filter((r) => r.responseTimeMs > SLOW_THRESHOLD_MS && !r.isBroken).length,
    healthy: results.filter((r) => !r.isBroken && r.statusCode !== null && r.statusCode < 300).length,
    links: results,
  };

  return summary;
}

/**
 * Store link check results in the database.
 */
export async function storeLinkCheckResults(
  supabase: SupabaseClient,
  qaResultId: string,
  results: LinkCheckResult[]
): Promise<void> {
  if (results.length === 0) return;

  const rows = results.map((r) => ({
    qa_result_id: qaResultId,
    url: r.url,
    status_code: r.statusCode,
    response_time_ms: r.responseTimeMs,
    link_type: r.linkType,
    is_broken: r.isBroken,
    error_message: r.errorMessage,
  }));

  const { error } = await supabase.from('qa_link_checks').insert(rows);
  if (error) {
    console.error('[LinkChecker] Failed to store results:', error.message);
  }
}

/**
 * Get link check results for a QA run.
 */
export async function getLinkCheckResults(
  supabase: SupabaseClient,
  qaResultId: string
): Promise<QALinkCheck[]> {
  const { data } = await supabase
    .from('qa_link_checks')
    .select('*')
    .eq('qa_result_id', qaResultId)
    .order('is_broken', { ascending: false });

  return (data as QALinkCheck[]) ?? [];
}
