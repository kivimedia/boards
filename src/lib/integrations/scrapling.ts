// ============================================================================
// SCRAPLING SERVICE CLIENT
// TypeScript bridge to the Python scrapling microservice on VPS (157.180.37.69:8099).
//
// Scrapling provides 3 fetcher tiers with increasing anti-bot capabilities:
//   1. Fetcher      — Fast HTTP with TLS fingerprint spoofing (curl_cffi)
//   2. DynamicFetcher — Playwright/Chromium for JS-rendered pages
//   3. StealthyFetcher — Camoufox (modified Firefox) for Cloudflare bypass
//
// This client is used as a fallback/upgrade when Browserless fails or when
// stealth capabilities are needed (e.g., Cloudflare-protected sites).
//
// The service runs as a systemd unit on the VPS. Set SCRAPLING_SERVICE_URL
// in .env.local to point to your VPS (e.g. http://157.180.37.69:8099).
// ============================================================================

const SCRAPLING_BASE_URL = process.env.SCRAPLING_SERVICE_URL || 'http://localhost:8099';
const DEFAULT_TIMEOUT = 30;

// ============================================================================
// TYPES
// ============================================================================

export interface ScraplingFetchOptions {
  url: string;
  impersonate?: string;  // 'chrome' | 'firefox' | 'safari' etc.
  timeout?: number;
  headers?: Record<string, string>;
}

export interface ScraplingDynamicOptions {
  url: string;
  waitSelector?: string;
  timeout?: number;
  headless?: boolean;
}

export interface ScraplingStealthOptions {
  url: string;
  timeout?: number;
  headless?: boolean;
  blockImages?: boolean;
}

export interface ScraplingExtractOptions {
  url: string;
  selectors: string[];
  fetcher?: 'fetch' | 'dynamic' | 'stealth';
  timeout?: number;
}

export interface ScraplingResult {
  success: boolean;
  url: string;
  status?: number;
  title?: string;
  content?: string;
  error?: string;
  fetcher_used: string;
  duration_ms: number;
  content_length?: number;
}

export interface ScraplingExtractResult {
  success: boolean;
  url: string;
  results: Record<string, string[]>;
  fetcher_used: string;
  duration_ms: number;
  error?: string;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check if the scrapling microservice is running.
 * Returns true if healthy, false if unavailable.
 */
export async function isScraplingAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${SCRAPLING_BASE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// FETCHER ENDPOINTS
// ============================================================================

/**
 * Fast HTTP fetch with TLS fingerprint impersonation.
 * Best for: static pages, APIs, sites without JS rendering.
 * Does NOT launch a browser — fastest option.
 */
export async function scraplingFetch(options: ScraplingFetchOptions): Promise<ScraplingResult> {
  return callScrapling('/fetch', {
    url: options.url,
    impersonate: options.impersonate || 'chrome',
    timeout: options.timeout || DEFAULT_TIMEOUT,
    headers: options.headers,
  });
}

/**
 * Full Chromium browser for JS-rendered pages.
 * Best for: SPAs, React/Vue/Angular sites, pages with dynamic content.
 * Moderate stealth — detectable by advanced anti-bot.
 */
export async function scraplingDynamic(options: ScraplingDynamicOptions): Promise<ScraplingResult> {
  return callScrapling('/dynamic', {
    url: options.url,
    wait_selector: options.waitSelector,
    timeout: options.timeout || DEFAULT_TIMEOUT,
    headless: options.headless ?? true,
  });
}

/**
 * Maximum anti-bot evasion via Camoufox (modified Firefox).
 * Best for: Cloudflare-protected sites, LinkedIn, sites with fingerprint detection.
 * Bypasses Cloudflare Turnstile, TLS fingerprinting, canvas fingerprinting.
 * Slowest but most undetectable.
 */
export async function scraplingStealthy(options: ScraplingStealthOptions): Promise<ScraplingResult> {
  return callScrapling('/stealth', {
    url: options.url,
    timeout: options.timeout || 45,
    headless: options.headless ?? true,
    disable_resources: options.blockImages ?? true,
  });
}

/**
 * Adaptive CSS selector extraction using any fetcher tier.
 * Best for: extracting specific elements (prices, titles, emails, etc.).
 */
export async function scraplingExtract(options: ScraplingExtractOptions): Promise<ScraplingExtractResult> {
  return callScrapling('/extract', {
    url: options.url,
    selectors: options.selectors,
    fetcher: options.fetcher || 'stealth',
    timeout: options.timeout || DEFAULT_TIMEOUT,
  });
}

// ============================================================================
// TIERED FETCH — tries Fetcher → Dynamic → Stealth with automatic escalation
// ============================================================================

/**
 * Smart tiered fetch: starts with the fastest method and escalates on failure.
 * Tries: HTTP fetch → Dynamic (Chromium) → Stealth (Camoufox).
 * Use this when you don't know how aggressive the site's anti-bot is.
 */
export async function scraplingTieredFetch(url: string, timeout?: number): Promise<ScraplingResult> {
  const t = timeout || DEFAULT_TIMEOUT;

  // Tier 1: Fast HTTP with TLS spoofing
  const r1 = await scraplingFetch({ url, timeout: t });
  if (r1.success && r1.content && r1.content_length && r1.content_length > 500) {
    return r1;
  }

  // Tier 2: Chromium for JS-rendered content
  const r2 = await scraplingDynamic({ url, timeout: t });
  if (r2.success && r2.content && r2.content_length && r2.content_length > 500) {
    return r2;
  }

  // Tier 3: Full stealth
  const r3 = await scraplingStealthy({ url, timeout: t + 15 });
  return r3;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

async function callScrapling<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = ((body.timeout as number) || DEFAULT_TIMEOUT) * 1000 + 10_000; // extra 10s buffer
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SCRAPLING_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      return {
        success: false,
        url: body.url as string,
        error: `Scrapling service error: ${response.status} ${errText}`,
        fetcher_used: endpoint.replace('/', ''),
        duration_ms: 0,
      } as T;
    }

    return (await response.json()) as T;
  } catch (err) {
    return {
      success: false,
      url: body.url as string,
      error: `Scrapling service unavailable: ${err instanceof Error ? err.message : String(err)}`,
      fetcher_used: endpoint.replace('/', ''),
      duration_ms: 0,
    } as T;
  } finally {
    clearTimeout(timer);
  }
}
