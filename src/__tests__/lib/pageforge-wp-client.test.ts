import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createWpClient,
  wpTestConnection,
  wpCreatePage,
  wpUpdatePage,
  wpGetPage,
  wpDeletePage,
  wpUploadMedia,
  wpGetPluginList,
  wpIsPluginActive,
  wpUpdateYoast,
  wpGetPreviewUrl,
  wpGetDraftUrl,
} from '@/lib/integrations/wordpress-client';
import type { WpClient, WpClientConfig } from '@/lib/integrations/wordpress-client';

// ============================================================================
// PAGEFORGE WORDPRESS CLIENT TESTS
// ============================================================================

const TEST_CONFIG: WpClientConfig = {
  restUrl: 'https://example.com/wp-json/wp/v2',
  username: 'admin',
  appPassword: 'xxxx yyyy zzzz',
};

function makeClient(): WpClient {
  return createWpClient(TEST_CONFIG);
}

function mockFetchOk(body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockFetchError(status: number, statusText: string, body = '') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: async () => ({ code: statusText, message: body }),
    text: async () => body || statusText,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// createWpClient
// ============================================================================

describe('createWpClient', () => {
  it('returns a client object with config and headers', () => {
    const client = makeClient();
    expect(client.config).toEqual(TEST_CONFIG);
    expect(client.headers).toBeDefined();
  });

  it('sets Authorization header with Base64-encoded credentials', () => {
    const client = makeClient();
    const expectedBase64 = Buffer.from('admin:xxxx yyyy zzzz').toString('base64');
    expect(client.headers['Authorization']).toBe(`Basic ${expectedBase64}`);
  });

  it('sets Content-Type header to application/json', () => {
    const client = makeClient();
    expect(client.headers['Content-Type']).toBe('application/json');
  });

  it('encodes special characters in password correctly', () => {
    const config: WpClientConfig = {
      restUrl: 'https://site.com/wp-json/wp/v2',
      username: 'user@domain.com',
      appPassword: 'p@$$w0rd!',
    };
    const client = createWpClient(config);
    const decoded = Buffer.from(
      client.headers['Authorization'].replace('Basic ', ''),
      'base64'
    ).toString('utf-8');
    expect(decoded).toBe('user@domain.com:p@$$w0rd!');
  });
});

// ============================================================================
// wpTestConnection
// ============================================================================

describe('wpTestConnection', () => {
  it('returns ok:true with site info on successful connection', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'My Site', description: 'WordPress 6.5' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, name: 'admin' }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const result = await wpTestConnection(TEST_CONFIG);

    expect(result.ok).toBe(true);
    expect(result.siteName).toBe('My Site');
    expect(result.wpVersion).toBe('WordPress 6.5');
    expect(result.error).toBeUndefined();
  });

  it('calls the root REST endpoint without /wp/v2 suffix', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', mockFetch);

    await wpTestConnection(TEST_CONFIG);

    const rootUrl = mockFetch.mock.calls[0][0];
    expect(rootUrl).toBe('https://example.com/wp-json');
    expect(rootUrl).not.toContain('/wp/v2');
  });

  it('returns ok:false when REST API is not reachable (non-200)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await wpTestConnection(TEST_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('503');
  });

  it('returns ok:false when authentication fails', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 401 });
    vi.stubGlobal('fetch', mockFetch);

    const result = await wpTestConnection(TEST_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Authentication failed');
    expect(result.error).toContain('401');
  });

  it('returns ok:false with error message on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await wpTestConnection(TEST_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('handles non-Error thrown values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('raw string error'));

    const result = await wpTestConnection(TEST_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('raw string error');
  });
});

// ============================================================================
// wpCreatePage
// ============================================================================

describe('wpCreatePage', () => {
  const mockPage = {
    id: 42,
    title: { rendered: 'New Page' },
    content: { rendered: '<p>Hello</p>' },
    slug: 'new-page',
    status: 'draft',
    link: 'https://example.com/?page_id=42',
    date: '2026-01-01T00:00:00',
    modified: '2026-01-01T00:00:00',
  };

  it('sends POST to /pages endpoint', async () => {
    const mock = mockFetchOk(mockPage);
    vi.stubGlobal('fetch', mock);

    await wpCreatePage(makeClient(), { title: 'New Page', content: '<p>Hello</p>' });

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe('https://example.com/wp-json/wp/v2/pages');
    expect(opts.method).toBe('POST');
  });

  it('includes title, content, slug, and status in request body', async () => {
    const mock = mockFetchOk(mockPage);
    vi.stubGlobal('fetch', mock);

    await wpCreatePage(makeClient(), {
      title: 'New Page',
      content: '<p>Hello</p>',
      slug: 'new-page',
      status: 'publish',
    });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.title).toBe('New Page');
    expect(body.content).toBe('<p>Hello</p>');
    expect(body.slug).toBe('new-page');
    expect(body.status).toBe('publish');
  });

  it('defaults status to draft when not provided', async () => {
    const mock = mockFetchOk(mockPage);
    vi.stubGlobal('fetch', mock);

    await wpCreatePage(makeClient(), { title: 'T', content: 'C' });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.status).toBe('draft');
  });

  it('returns WpPage data on success', async () => {
    vi.stubGlobal('fetch', mockFetchOk(mockPage));

    const result = await wpCreatePage(makeClient(), { title: 'New Page', content: '<p>Hello</p>' });
    expect(result.id).toBe(42);
    expect(result.title.rendered).toBe('New Page');
  });

  it('throws with status code on failure', async () => {
    vi.stubGlobal('fetch', mockFetchError(403, 'Forbidden', 'You shall not pass'));

    await expect(
      wpCreatePage(makeClient(), { title: 'T', content: 'C' })
    ).rejects.toThrow('WP create page failed (403)');
  });

  it('handles empty slug gracefully', async () => {
    const mock = mockFetchOk(mockPage);
    vi.stubGlobal('fetch', mock);

    await wpCreatePage(makeClient(), { title: 'T', content: 'C', slug: '' });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.slug).toBe('');
  });

  it('handles special characters in title', async () => {
    const mock = mockFetchOk(mockPage);
    vi.stubGlobal('fetch', mock);

    await wpCreatePage(makeClient(), {
      title: 'Page <with> "special" & chars',
      content: '<div>Content</div>',
    });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.title).toBe('Page <with> "special" & chars');
  });

  it('handles large content body', async () => {
    const mock = mockFetchOk(mockPage);
    vi.stubGlobal('fetch', mock);

    const largeContent = '<p>' + 'A'.repeat(100_000) + '</p>';
    await wpCreatePage(makeClient(), { title: 'Big Page', content: largeContent });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.content.length).toBeGreaterThan(100_000);
  });
});

// ============================================================================
// wpUpdatePage
// ============================================================================

describe('wpUpdatePage', () => {
  const updatedPage = {
    id: 42,
    title: { rendered: 'Updated' },
    content: { rendered: '<p>Updated content</p>' },
    slug: 'updated',
    status: 'publish',
    link: 'https://example.com/updated/',
    date: '2026-01-01T00:00:00',
    modified: '2026-01-02T00:00:00',
  };

  it('sends PUT to /pages/:id endpoint', async () => {
    const mock = mockFetchOk(updatedPage);
    vi.stubGlobal('fetch', mock);

    await wpUpdatePage(makeClient(), 42, { title: 'Updated' });

    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe('https://example.com/wp-json/wp/v2/pages/42');
    expect(opts.method).toBe('PUT');
  });

  it('sends only the provided partial fields', async () => {
    const mock = mockFetchOk(updatedPage);
    vi.stubGlobal('fetch', mock);

    await wpUpdatePage(makeClient(), 42, { title: 'Updated' });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body).toEqual({ title: 'Updated' });
    expect(body.content).toBeUndefined();
  });

  it('returns the updated page', async () => {
    vi.stubGlobal('fetch', mockFetchOk(updatedPage));

    const result = await wpUpdatePage(makeClient(), 42, { status: 'publish' });
    expect(result.status).toBe('publish');
  });

  it('throws on 404 not found', async () => {
    vi.stubGlobal('fetch', mockFetchError(404, 'Not Found', 'Page not found'));

    await expect(
      wpUpdatePage(makeClient(), 9999, { title: 'X' })
    ).rejects.toThrow('WP update page failed (404)');
  });
});

// ============================================================================
// wpGetPage
// ============================================================================

describe('wpGetPage', () => {
  const pageData = {
    id: 7,
    title: { rendered: 'About' },
    content: { rendered: '<p>About us</p>' },
    slug: 'about',
    status: 'publish',
    link: 'https://example.com/about/',
    date: '2025-06-15T00:00:00',
    modified: '2025-07-01T00:00:00',
  };

  it('sends GET to /pages/:id endpoint', async () => {
    const mock = mockFetchOk(pageData);
    vi.stubGlobal('fetch', mock);

    await wpGetPage(makeClient(), 7);

    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe('https://example.com/wp-json/wp/v2/pages/7');
    expect(opts.method).toBeUndefined(); // GET is the default
  });

  it('includes auth headers', async () => {
    const mock = mockFetchOk(pageData);
    vi.stubGlobal('fetch', mock);

    const client = makeClient();
    await wpGetPage(client, 7);

    expect(mock.mock.calls[0][1].headers).toEqual(client.headers);
  });

  it('returns page data', async () => {
    vi.stubGlobal('fetch', mockFetchOk(pageData));

    const result = await wpGetPage(makeClient(), 7);
    expect(result.id).toBe(7);
    expect(result.slug).toBe('about');
  });

  it('throws on 500 server error', async () => {
    vi.stubGlobal('fetch', mockFetchError(500, 'Internal Server Error', 'DB crash'));

    await expect(wpGetPage(makeClient(), 7)).rejects.toThrow('WP get page failed (500)');
  });
});

// ============================================================================
// wpDeletePage
// ============================================================================

describe('wpDeletePage', () => {
  it('sends DELETE to /pages/:id with force=true', async () => {
    const mock = mockFetchOk({});
    vi.stubGlobal('fetch', mock);

    await wpDeletePage(makeClient(), 42);

    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe('https://example.com/wp-json/wp/v2/pages/42?force=true');
    expect(opts.method).toBe('DELETE');
  });

  it('includes auth headers', async () => {
    const mock = mockFetchOk({});
    vi.stubGlobal('fetch', mock);

    const client = makeClient();
    await wpDeletePage(client, 42);

    expect(mock.mock.calls[0][1].headers).toEqual(client.headers);
  });

  it('resolves on success', async () => {
    vi.stubGlobal('fetch', mockFetchOk({}));

    await expect(wpDeletePage(makeClient(), 42)).resolves.toBeUndefined();
  });

  it('throws on 401 unauthorized', async () => {
    vi.stubGlobal('fetch', mockFetchError(401, 'Unauthorized', 'Invalid credentials'));

    await expect(wpDeletePage(makeClient(), 42)).rejects.toThrow('WP delete page failed (401)');
  });
});

// ============================================================================
// wpUploadMedia
// ============================================================================

describe('wpUploadMedia', () => {
  const mediaResponse = {
    id: 100,
    source_url: 'https://example.com/wp-content/uploads/img.png',
    title: { rendered: 'img.png' },
    alt_text: '',
    media_details: {
      width: 1200,
      height: 630,
      file: '2026/01/img.png',
      sizes: {},
    },
  };

  it('sends POST to /media endpoint', async () => {
    const mock = mockFetchOk(mediaResponse);
    vi.stubGlobal('fetch', mock);

    const buf = Buffer.from('fake-image-data');
    await wpUploadMedia(makeClient(), buf, 'img.png', 'image/png');

    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe('https://example.com/wp-json/wp/v2/media');
    expect(opts.method).toBe('POST');
  });

  it('sets Content-Disposition header with filename', async () => {
    const mock = mockFetchOk(mediaResponse);
    vi.stubGlobal('fetch', mock);

    await wpUploadMedia(makeClient(), Buffer.from('data'), 'photo.jpg', 'image/jpeg');

    const headers = mock.mock.calls[0][1].headers;
    expect(headers['Content-Disposition']).toBe('attachment; filename="photo.jpg"');
  });

  it('sets Content-Type to the provided mimeType', async () => {
    const mock = mockFetchOk(mediaResponse);
    vi.stubGlobal('fetch', mock);

    await wpUploadMedia(makeClient(), Buffer.from('data'), 'doc.pdf', 'application/pdf');

    const headers = mock.mock.calls[0][1].headers;
    expect(headers['Content-Type']).toBe('application/pdf');
  });

  it('sends binary body as Uint8Array', async () => {
    const mock = mockFetchOk(mediaResponse);
    vi.stubGlobal('fetch', mock);

    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await wpUploadMedia(makeClient(), buf, 'test.png', 'image/png');

    const sentBody = mock.mock.calls[0][1].body;
    expect(sentBody).toBeInstanceOf(Uint8Array);
  });

  it('returns WpMedia data on success', async () => {
    vi.stubGlobal('fetch', mockFetchOk(mediaResponse));

    const result = await wpUploadMedia(makeClient(), Buffer.from('x'), 'img.png', 'image/png');
    expect(result.id).toBe(100);
    expect(result.source_url).toContain('img.png');
  });

  it('throws on upload failure', async () => {
    vi.stubGlobal('fetch', mockFetchError(413, 'Payload Too Large', 'File too big'));

    await expect(
      wpUploadMedia(makeClient(), Buffer.from('x'), 'huge.zip', 'application/zip')
    ).rejects.toThrow('WP media upload failed (413)');
  });
});

// ============================================================================
// wpGetPluginList
// ============================================================================

describe('wpGetPluginList', () => {
  it('sends GET to /plugins endpoint', async () => {
    const mock = mockFetchOk([]);
    vi.stubGlobal('fetch', mock);

    await wpGetPluginList(makeClient());

    expect(mock.mock.calls[0][0]).toBe('https://example.com/wp-json/wp/v2/plugins');
  });

  it('returns plugin array on success', async () => {
    const plugins = [
      { plugin: 'wordpress-seo/wp-seo.php', status: 'active', name: 'Yoast SEO', version: '22.0' },
      { plugin: 'akismet/akismet.php', status: 'inactive', name: 'Akismet', version: '5.3' },
    ];
    vi.stubGlobal('fetch', mockFetchOk(plugins));

    const result = await wpGetPluginList(makeClient());
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Yoast SEO');
  });

  it('returns empty array on permission error', async () => {
    vi.stubGlobal('fetch', mockFetchError(403, 'Forbidden'));

    const result = await wpGetPluginList(makeClient());
    expect(result).toEqual([]);
  });
});

// ============================================================================
// wpIsPluginActive
// ============================================================================

describe('wpIsPluginActive', () => {
  it('returns true when plugin status is active', async () => {
    const plugins = [
      { plugin: 'wordpress-seo/wp-seo.php', status: 'active', name: 'Yoast SEO', version: '22.0' },
    ];
    vi.stubGlobal('fetch', mockFetchOk(plugins));

    const result = await wpIsPluginActive(makeClient(), 'wordpress-seo');
    expect(result).toBe(true);
  });

  it('returns false when plugin is inactive', async () => {
    const plugins = [
      { plugin: 'wordpress-seo/wp-seo.php', status: 'inactive', name: 'Yoast SEO', version: '22.0' },
    ];
    vi.stubGlobal('fetch', mockFetchOk(plugins));

    const result = await wpIsPluginActive(makeClient(), 'wordpress-seo');
    expect(result).toBe(false);
  });

  it('returns false when plugin is not in the list', async () => {
    vi.stubGlobal('fetch', mockFetchOk([]));

    const result = await wpIsPluginActive(makeClient(), 'nonexistent-plugin');
    expect(result).toBe(false);
  });
});

// ============================================================================
// wpUpdateYoast
// ============================================================================

describe('wpUpdateYoast', () => {
  it('sends POST to /pages/:id with yoast meta fields', async () => {
    const mock = mockFetchOk({});
    vi.stubGlobal('fetch', mock);

    await wpUpdateYoast(makeClient(), 42, {
      metaTitle: 'SEO Title',
      metaDesc: 'SEO description',
    });

    const [url, opts] = mock.mock.calls[0];
    expect(url).toBe('https://example.com/wp-json/wp/v2/pages/42');
    expect(opts.method).toBe('POST');
  });

  it('maps WpYoastMeta fields to yoast_wpseo_ prefixed keys', async () => {
    const mock = mockFetchOk({});
    vi.stubGlobal('fetch', mock);

    await wpUpdateYoast(makeClient(), 10, {
      metaTitle: 'Title',
      metaDesc: 'Description',
      focusKeyphrase: 'keyword',
      ogTitle: 'OG Title',
      ogDesc: 'OG Desc',
      ogImage: 'https://img.com/og.jpg',
    });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.meta).toEqual({
      yoast_wpseo_title: 'Title',
      yoast_wpseo_metadesc: 'Description',
      yoast_wpseo_focuskw: 'keyword',
      'yoast_wpseo_opengraph-title': 'OG Title',
      'yoast_wpseo_opengraph-description': 'OG Desc',
      'yoast_wpseo_opengraph-image': 'https://img.com/og.jpg',
    });
  });

  it('only includes provided meta fields', async () => {
    const mock = mockFetchOk({});
    vi.stubGlobal('fetch', mock);

    await wpUpdateYoast(makeClient(), 10, { metaTitle: 'Just title' });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(Object.keys(body.meta)).toEqual(['yoast_wpseo_title']);
  });

  it('throws on failure', async () => {
    vi.stubGlobal('fetch', mockFetchError(500, 'Server Error', 'Yoast plugin error'));

    await expect(
      wpUpdateYoast(makeClient(), 42, { metaTitle: 'T' })
    ).rejects.toThrow('WP Yoast update failed (500)');
  });
});

// ============================================================================
// Error handling across functions
// ============================================================================

describe('error handling', () => {
  it('wpCreatePage throws on 401 unauthorized', async () => {
    vi.stubGlobal('fetch', mockFetchError(401, 'Unauthorized'));

    await expect(
      wpCreatePage(makeClient(), { title: 'T', content: 'C' })
    ).rejects.toThrow('(401)');
  });

  it('wpUpdatePage throws on network timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('AbortError: signal timed out')));

    await expect(
      wpUpdatePage(makeClient(), 1, { title: 'T' })
    ).rejects.toThrow('AbortError');
  });

  it('wpGetPage throws on 404 not found', async () => {
    vi.stubGlobal('fetch', mockFetchError(404, 'Not Found'));

    await expect(wpGetPage(makeClient(), 99999)).rejects.toThrow('(404)');
  });

  it('wpDeletePage throws on 500 server error', async () => {
    vi.stubGlobal('fetch', mockFetchError(500, 'Internal Server Error'));

    await expect(wpDeletePage(makeClient(), 1)).rejects.toThrow('(500)');
  });
});

// ============================================================================
// Helper functions
// ============================================================================

describe('wpGetPreviewUrl', () => {
  it('returns the correct preview URL', () => {
    const url = wpGetPreviewUrl('https://example.com', 42);
    expect(url).toBe('https://example.com/?page_id=42&preview=true');
  });
});

describe('wpGetDraftUrl', () => {
  it('returns the correct draft URL with trailing slash', () => {
    const url = wpGetDraftUrl('https://example.com', 'my-page');
    expect(url).toBe('https://example.com/my-page/');
  });
});
