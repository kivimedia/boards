import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserlessClient, sanitizeUrl, isAllowedDomain, estimateBrowserCost } from '@/lib/integrations/browserless';

// ============================================================================
// BROWSERLESS CLIENT TESTS
// ============================================================================

describe('BrowserlessClient', () => {
  let client: BrowserlessClient;

  beforeEach(() => {
    client = new BrowserlessClient({ apiToken: 'test-token', timeout: 5000 });
    vi.restoreAllMocks();
  });

  describe('getContent', () => {
    it('rejects blocked URLs without making a request', async () => {
      await expect(client.getContent('http://localhost:3000')).rejects.toThrow('URL blocked');
    });

    it('rejects file:// URLs', async () => {
      await expect(client.getContent('file:///etc/passwd')).rejects.toThrow('URL blocked');
    });

    it('rejects javascript: URLs', async () => {
      await expect(client.getContent('javascript:alert(1)')).rejects.toThrow('URL blocked');
    });

    it('calls Browserless /content API with correct params', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<html><head><title>Test</title></head><body>Hello World</body></html>',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.getContent('https://example.com');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.title).toBe('Test');
      expect(result.content).toContain('Hello World');
      expect(result.url).toBe('https://example.com/');
    });

    it('throws on non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' }));

      await expect(client.getContent('https://example.com')).rejects.toThrow('Browserless API error');
    });

    it('strips script and style tags from content', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<html><script>evil()</script><style>body{}</style><body>Clean text</body></html>',
      }));

      const result = await client.getContent('https://example.com');
      expect(result.content).not.toContain('evil()');
      expect(result.content).not.toContain('body{}');
      expect(result.content).toContain('Clean text');
    });
  });

  describe('scrape', () => {
    it('rejects blocked URLs', async () => {
      await expect(client.scrape('http://127.0.0.1', [{ selector: 'h1' }])).rejects.toThrow('URL blocked');
    });

    it('calls /scrape API and returns results', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ selector: 'h1', results: [{ text: 'Title' }] }] }),
      }));

      const result = await client.scrape('https://example.com', [{ selector: 'h1' }]);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].results[0].text).toBe('Title');
    });
  });

  describe('screenshot', () => {
    it('rejects blocked URLs', async () => {
      await expect(client.screenshot('http://192.168.1.1')).rejects.toThrow('URL blocked');
    });

    it('calls /screenshot API and returns buffer', async () => {
      const mockBuffer = new ArrayBuffer(10);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockBuffer,
      }));

      const result = await client.screenshot('https://example.com');
      expect(result.contentType).toBe('image/png');
      expect(result.screenshot).toBeInstanceOf(Buffer);
    });
  });

  describe('checkLink', () => {
    it('rejects blocked URLs', async () => {
      await expect(client.checkLink('http://10.0.0.1')).rejects.toThrow('URL blocked');
    });

    it('returns status for reachable URLs', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        redirected: false,
        url: 'https://example.com/',
      }));

      const result = await client.checkLink('https://example.com');
      expect(result.status).toBe(200);
      expect(result.ok).toBe(true);
      expect(result.redirected).toBe(false);
    });

    it('returns ok: false for unreachable URLs', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      const result = await client.checkLink('https://unreachable.example');
      expect(result.ok).toBe(false);
      expect(result.status).toBe(0);
    });

    it('reports redirects', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        redirected: true,
        url: 'https://example.com/new-location',
      }));

      const result = await client.checkLink('https://example.com/old');
      expect(result.redirected).toBe(true);
      expect(result.finalUrl).toBe('https://example.com/new-location');
    });
  });
});

// ============================================================================
// ADDITIONAL SANITIZE / ALLOWLIST / COST TESTS
// ============================================================================

describe('sanitizeUrl edge cases', () => {
  it('handles URL with port', () => {
    const result = sanitizeUrl('https://example.com:8080/path');
    expect(result.valid).toBe(true);
  });

  it('handles URL with query params', () => {
    const result = sanitizeUrl('https://example.com?q=test&page=1');
    expect(result.valid).toBe(true);
  });

  it('handles URL with hash', () => {
    const result = sanitizeUrl('https://example.com#section');
    expect(result.valid).toBe(true);
  });

  it('rejects ftp: scheme', () => {
    const result = sanitizeUrl('ftp://files.example.com');
    expect(result.valid).toBe(false);
  });
});

describe('estimateBrowserCost additional', () => {
  it('handles large values', () => {
    const cost = estimateBrowserCost(3600); // 1 hour
    expect(cost).toBeCloseTo(0.36, 2);
  });

  it('handles fractional seconds', () => {
    const cost = estimateBrowserCost(0.5);
    expect(cost).toBeGreaterThan(0);
  });
});
