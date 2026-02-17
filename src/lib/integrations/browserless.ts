import { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// BROWSERLESS.IO REST API CLIENT
// Renders pages, scrapes content, takes screenshots via serverless Chrome.
// ============================================================================

const BROWSERLESS_API_BASE = 'https://chrome.browserless.io';
const DEFAULT_TIMEOUT = 30_000;
const MAX_CONTENT_LENGTH = 30_000;

// ============================================================================
// URL SAFETY
// ============================================================================

const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.',
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
  'supabase.co',
  'supabase.com',
];

const BLOCKED_SCHEMES = ['file:', 'javascript:', 'data:', 'blob:', 'ftp:'];

/**
 * Validate and sanitize a URL before sending it to Browserless.
 * Rejects internal IPs, dangerous schemes, and Supabase URLs.
 */
export function sanitizeUrl(url: string): { valid: boolean; url: string; reason?: string } {
  const trimmed = url.trim();

  // Check blocked schemes
  for (const scheme of BLOCKED_SCHEMES) {
    if (trimmed.toLowerCase().startsWith(scheme)) {
      return { valid: false, url: trimmed, reason: `Blocked scheme: ${scheme}` };
    }
  }

  // Ensure it's http or https
  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return { valid: false, url: trimmed, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, url: trimmed, reason: `Unsupported protocol: ${parsed.protocol}` };
  }

  // Check blocked hosts
  const hostname = parsed.hostname.toLowerCase();
  for (const blocked of BLOCKED_HOSTS) {
    if (hostname === blocked || hostname.startsWith(blocked) || hostname.endsWith(`.${blocked}`)) {
      return { valid: false, url: parsed.href, reason: `Blocked host: ${hostname}` };
    }
  }

  return { valid: true, url: parsed.href };
}

/**
 * Check if a URL's domain is in the allowlist.
 * If allowlist is empty, all non-blocked domains are allowed.
 */
export function isAllowedDomain(url: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return allowlist.some((domain) => {
      const d = domain.toLowerCase().replace(/^\./, '');
      return hostname === d || hostname.endsWith(`.${d}`);
    });
  } catch {
    return false;
  }
}

// ============================================================================
// COST ESTIMATION
// ============================================================================

const BROWSER_COST_PER_SECOND = 0.0001; // ~$0.36/hour

/**
 * Estimate Browserless cost based on seconds of browser usage.
 */
export function estimateBrowserCost(seconds: number): number {
  return Math.round(seconds * BROWSER_COST_PER_SECOND * 1_000_000) / 1_000_000;
}

// ============================================================================
// BROWSERLESS CLIENT
// ============================================================================

export interface BrowserlessConfig {
  apiToken: string;
  timeout?: number;
}

export interface BrowserlessContentResult {
  content: string;
  title: string;
  url: string;
  status: number;
}

export interface BrowserlessScrapeResult {
  data: { selector: string; results: { text: string; href?: string; src?: string }[] }[];
  url: string;
}

export interface BrowserlessScreenshotResult {
  screenshot: Buffer;
  contentType: string;
}

export class BrowserlessClient {
  private apiToken: string;
  private timeout: number;

  constructor(config: BrowserlessConfig) {
    this.apiToken = config.apiToken;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  /**
   * Navigate to URL and get rendered text content.
   * Uses /content endpoint (returns full rendered HTML converted to text).
   */
  async getContent(url: string): Promise<BrowserlessContentResult> {
    const check = sanitizeUrl(url);
    if (!check.valid) throw new Error(`URL blocked: ${check.reason}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${BROWSERLESS_API_BASE}/content?token=${this.apiToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: check.url,
          waitForSelector: 'body',
          waitForTimeout: 3000,
          gotoOptions: { waitUntil: 'networkidle2', timeout: 20000 },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Browserless API error: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      // Simple HTML to text conversion (strip tags, decode entities)
      const text = htmlToText(html).slice(0, MAX_CONTENT_LENGTH);
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';

      return { content: text, title, url: check.url, status: response.status };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Scrape specific CSS selectors from a page.
   * Uses /scrape endpoint.
   */
  async scrape(url: string, selectors: { selector: string; attribute?: string }[]): Promise<BrowserlessScrapeResult> {
    const check = sanitizeUrl(url);
    if (!check.valid) throw new Error(`URL blocked: ${check.reason}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const elements = selectors.map((s) => ({
        selector: s.selector,
        ...(s.attribute ? { attribute: s.attribute } : {}),
      }));

      const response = await fetch(`${BROWSERLESS_API_BASE}/scrape?token=${this.apiToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: check.url,
          elements,
          waitForSelector: selectors[0]?.selector || 'body',
          gotoOptions: { waitUntil: 'networkidle2', timeout: 20000 },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Browserless scrape error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return { data: result.data || [], url: check.url };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Take a screenshot of a page.
   * Uses /screenshot endpoint.
   */
  async screenshot(url: string, options?: { fullPage?: boolean; selector?: string }): Promise<BrowserlessScreenshotResult> {
    const check = sanitizeUrl(url);
    if (!check.valid) throw new Error(`URL blocked: ${check.reason}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const body: Record<string, unknown> = {
        url: check.url,
        options: {
          type: 'png',
          fullPage: options?.fullPage ?? false,
        },
        gotoOptions: { waitUntil: 'networkidle2', timeout: 20000 },
      };

      if (options?.selector) {
        body.selector = options.selector;
      }

      const response = await fetch(`${BROWSERLESS_API_BASE}/screenshot?token=${this.apiToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Browserless screenshot error: ${response.status} ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return { screenshot: buffer, contentType: 'image/png' };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Simple HTTP HEAD check for link health.
   * Does NOT use Browserless (no browser needed).
   */
  async checkLink(url: string): Promise<{ status: number; redirected: boolean; finalUrl: string; ok: boolean }> {
    const check = sanitizeUrl(url);
    if (!check.valid) throw new Error(`URL blocked: ${check.reason}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(check.url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      });

      return {
        status: response.status,
        redirected: response.redirected,
        finalUrl: response.url,
        ok: response.ok,
      };
    } catch (err) {
      return {
        status: 0,
        redirected: false,
        finalUrl: check.url,
        ok: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a BrowserlessClient from the integration config in Supabase.
 */
export async function createBrowserlessClient(
  supabase: SupabaseClient
): Promise<BrowserlessClient | null> {
  const { data } = await supabase
    .from('pga_integration_configs')
    .select('config')
    .eq('service', 'browserless')
    .limit(1)
    .maybeSingle();

  const apiToken = data?.config?.api_token || data?.config?.apiToken;
  if (!apiToken) return null;

  return new BrowserlessClient({ apiToken });
}

// ============================================================================
// HELPERS
// ============================================================================

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}
