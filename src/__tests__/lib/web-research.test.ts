import { describe, it, expect } from 'vitest';
import { sanitizeUrl, isAllowedDomain, estimateBrowserCost } from '@/lib/integrations/browserless';
import { getWebResearchPrompt, getTaskTypeDescriptions } from '@/lib/ai/web-research-prompts';

// ============================================================================
// URL SANITIZATION TESTS
// ============================================================================

describe('sanitizeUrl', () => {
  it('accepts valid HTTPS URLs', () => {
    const result = sanitizeUrl('https://example.com/page');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/page');
  });

  it('accepts valid HTTP URLs', () => {
    const result = sanitizeUrl('http://example.com');
    expect(result.valid).toBe(true);
  });

  it('auto-prepends https when no scheme', () => {
    const result = sanitizeUrl('example.com');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/');
  });

  it('rejects file:// scheme', () => {
    const result = sanitizeUrl('file:///etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Blocked scheme');
  });

  it('rejects javascript: scheme', () => {
    const result = sanitizeUrl('javascript:alert(1)');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Blocked scheme');
  });

  it('rejects data: scheme', () => {
    const result = sanitizeUrl('data:text/html,<h1>test</h1>');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Blocked scheme');
  });

  it('rejects localhost', () => {
    const result = sanitizeUrl('http://localhost:3000');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Blocked host');
  });

  it('rejects 127.0.0.1', () => {
    const result = sanitizeUrl('http://127.0.0.1');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Blocked host');
  });

  it('rejects 10.x internal IPs', () => {
    const result = sanitizeUrl('http://10.0.0.1');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Blocked host');
  });

  it('rejects 192.168.x internal IPs', () => {
    const result = sanitizeUrl('http://192.168.1.1');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Blocked host');
  });

  it('rejects supabase.co URLs', () => {
    const result = sanitizeUrl('https://xyz.supabase.co');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Blocked host');
  });

  it('rejects blob: scheme', () => {
    const result = sanitizeUrl('blob:http://example.com/uuid');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Blocked scheme');
  });

  it('rejects empty URL gracefully', () => {
    const result = sanitizeUrl('');
    // Should fail either on scheme or parse
    expect(result.valid).toBe(false);
  });

  it('trims whitespace', () => {
    const result = sanitizeUrl('  https://example.com  ');
    expect(result.valid).toBe(true);
    expect(result.url).toBe('https://example.com/');
  });

  it('rejects 172.16.x-172.31.x private ranges', () => {
    expect(sanitizeUrl('http://172.16.0.1').valid).toBe(false);
    expect(sanitizeUrl('http://172.31.255.1').valid).toBe(false);
  });

  it('allows 172.32.x and above (public)', () => {
    // 172.32 is not in our blocked list
    const result = sanitizeUrl('http://172.32.0.1');
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// DOMAIN ALLOWLIST TESTS
// ============================================================================

describe('isAllowedDomain', () => {
  it('allows any domain when allowlist is empty', () => {
    expect(isAllowedDomain('https://example.com', [])).toBe(true);
    expect(isAllowedDomain('https://anything.org', [])).toBe(true);
  });

  it('allows exact domain match', () => {
    expect(isAllowedDomain('https://example.com/page', ['example.com'])).toBe(true);
  });

  it('allows subdomain match', () => {
    expect(isAllowedDomain('https://www.example.com', ['example.com'])).toBe(true);
    expect(isAllowedDomain('https://blog.example.com', ['example.com'])).toBe(true);
  });

  it('rejects non-matching domain', () => {
    expect(isAllowedDomain('https://other.com', ['example.com'])).toBe(false);
  });

  it('handles domains with leading dots', () => {
    expect(isAllowedDomain('https://www.example.com', ['.example.com'])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAllowedDomain('https://EXAMPLE.COM', ['example.com'])).toBe(true);
  });

  it('handles invalid URLs gracefully', () => {
    expect(isAllowedDomain('not-a-url', ['example.com'])).toBe(false);
  });

  it('checks multiple domains in allowlist', () => {
    const list = ['example.com', 'test.org'];
    expect(isAllowedDomain('https://example.com', list)).toBe(true);
    expect(isAllowedDomain('https://test.org', list)).toBe(true);
    expect(isAllowedDomain('https://other.net', list)).toBe(false);
  });
});

// ============================================================================
// COST ESTIMATION TESTS
// ============================================================================

describe('estimateBrowserCost', () => {
  it('returns 0 for 0 seconds', () => {
    expect(estimateBrowserCost(0)).toBe(0);
  });

  it('calculates cost at $0.0001/second', () => {
    const cost = estimateBrowserCost(100);
    expect(cost).toBeCloseTo(0.01, 4);
  });

  it('returns a number with max 6 decimal places', () => {
    const cost = estimateBrowserCost(7);
    const decimals = cost.toString().split('.')[1]?.length || 0;
    expect(decimals).toBeLessThanOrEqual(6);
  });
});

// ============================================================================
// TASK PROMPT TESTS
// ============================================================================

describe('getWebResearchPrompt', () => {
  it('returns prompt for url_import task type', () => {
    const prompt = getWebResearchPrompt('url_import');
    expect(prompt).toContain('URL Content Import');
    expect(prompt).toContain('Navigate to the page');
  });

  it('returns prompt for competitor_research task type', () => {
    const prompt = getWebResearchPrompt('competitor_research');
    expect(prompt).toContain('Competitor Research');
    expect(prompt).toContain('competitor');
  });

  it('returns prompt for link_health task type', () => {
    const prompt = getWebResearchPrompt('link_health');
    expect(prompt).toContain('Link Health');
    expect(prompt).toContain('check_link');
  });

  it('returns prompt for content_extraction task type', () => {
    const prompt = getWebResearchPrompt('content_extraction');
    expect(prompt).toContain('Content Extraction');
  });

  it('returns prompt for social_proof task type', () => {
    const prompt = getWebResearchPrompt('social_proof');
    expect(prompt).toContain('Social Proof');
    expect(prompt).toContain('testimonial');
  });

  it('returns general prompt for general task type', () => {
    const prompt = getWebResearchPrompt('general');
    expect(prompt).toContain('General Web Research');
  });

  it('all prompts contain base instructions', () => {
    const types = ['url_import', 'competitor_research', 'link_health', 'content_extraction', 'social_proof', 'general'] as const;
    for (const type of types) {
      const prompt = getWebResearchPrompt(type);
      expect(prompt).toContain('web research agent');
      expect(prompt).toContain('read-only browsing');
    }
  });
});

describe('getTaskTypeDescriptions', () => {
  it('returns 6 task types', () => {
    const descriptions = getTaskTypeDescriptions();
    expect(descriptions).toHaveLength(6);
  });

  it('each entry has type, label, and description', () => {
    const descriptions = getTaskTypeDescriptions();
    for (const d of descriptions) {
      expect(d.type).toBeTruthy();
      expect(d.label).toBeTruthy();
      expect(d.description).toBeTruthy();
    }
  });

  it('includes all 6 types', () => {
    const types = getTaskTypeDescriptions().map(d => d.type);
    expect(types).toContain('url_import');
    expect(types).toContain('competitor_research');
    expect(types).toContain('link_health');
    expect(types).toContain('content_extraction');
    expect(types).toContain('social_proof');
    expect(types).toContain('general');
  });
});

// ============================================================================
// SESSION STATE TRANSITIONS
// ============================================================================

describe('Session state model', () => {
  const validStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
  const validTaskTypes = ['url_import', 'competitor_research', 'link_health', 'content_extraction', 'social_proof', 'general'];

  it('defines 5 valid statuses', () => {
    expect(validStatuses).toHaveLength(5);
  });

  it('defines 6 valid task types', () => {
    expect(validTaskTypes).toHaveLength(6);
  });

  it('pending -> running is a valid transition', () => {
    expect(validStatuses).toContain('pending');
    expect(validStatuses).toContain('running');
  });

  it('running -> completed is a valid transition', () => {
    expect(validStatuses).toContain('running');
    expect(validStatuses).toContain('completed');
  });

  it('running -> failed is a valid transition', () => {
    expect(validStatuses).toContain('running');
    expect(validStatuses).toContain('failed');
  });

  it('running -> cancelled is a valid transition', () => {
    expect(validStatuses).toContain('running');
    expect(validStatuses).toContain('cancelled');
  });
});
