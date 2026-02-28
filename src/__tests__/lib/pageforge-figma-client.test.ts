import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFigmaClient,
  figmaGetFile,
  figmaGetFileNodes,
  figmaGetImages,
  figmaDownloadImage,
  figmaExtractSections,
  figmaExtractColors,
  figmaExtractTypography,
  figmaParseUrl,
  figmaTestConnection,
} from '@/lib/integrations/figma-client';
import type { FigmaClient, FigmaNode } from '@/lib/integrations/figma-client';

// ============================================================================
// PAGEFORGE FIGMA CLIENT TESTS
// ============================================================================

const TEST_TOKEN = 'figd_test_token_abc123';
const FIGMA_BASE = 'https://api.figma.com/v1';

function makeClient(): FigmaClient {
  return createFigmaClient(TEST_TOKEN);
}

function mockFetchOk(body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  });
}

function mockFetchError(status: number, body = '') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ status, err: body }),
    text: async () => body || `Error ${status}`,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// createFigmaClient
// ============================================================================

describe('createFigmaClient', () => {
  it('returns a client with the provided token', () => {
    const client = makeClient();
    expect(client.token).toBe(TEST_TOKEN);
  });

  it('sets X-Figma-Token header', () => {
    const client = makeClient();
    expect(client.headers['X-Figma-Token']).toBe(TEST_TOKEN);
  });

  it('does not include any other headers', () => {
    const client = makeClient();
    expect(Object.keys(client.headers)).toEqual(['X-Figma-Token']);
  });
});

// ============================================================================
// figmaGetFile
// ============================================================================

describe('figmaGetFile', () => {
  const fileData = {
    name: 'My Design',
    lastModified: '2026-01-01T00:00:00Z',
    version: '12345',
    document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] },
    components: {},
    styles: {},
  };

  it('sends GET to /files/:key', async () => {
    const mock = mockFetchOk(fileData);
    vi.stubGlobal('fetch', mock);

    await figmaGetFile(makeClient(), 'ABC123key');

    const url = mock.mock.calls[0][0];
    expect(url).toBe(`${FIGMA_BASE}/files/ABC123key`);
  });

  it('includes X-Figma-Token header', async () => {
    const mock = mockFetchOk(fileData);
    vi.stubGlobal('fetch', mock);

    await figmaGetFile(makeClient(), 'key123');

    const headers = mock.mock.calls[0][1].headers;
    expect(headers['X-Figma-Token']).toBe(TEST_TOKEN);
  });

  it('returns file data with document, components, and styles', async () => {
    vi.stubGlobal('fetch', mockFetchOk(fileData));

    const result = await figmaGetFile(makeClient(), 'key123');
    expect(result.name).toBe('My Design');
    expect(result.document.type).toBe('DOCUMENT');
    expect(result.components).toEqual({});
  });

  it('throws on 404 file not found', async () => {
    vi.stubGlobal('fetch', mockFetchError(404, 'Not found'));

    await expect(figmaGetFile(makeClient(), 'bad-key')).rejects.toThrow('Figma get file failed (404)');
  });

  it('throws on 403 invalid token', async () => {
    vi.stubGlobal('fetch', mockFetchError(403, 'Invalid token'));

    await expect(figmaGetFile(makeClient(), 'key123')).rejects.toThrow('Figma get file failed (403)');
  });
});

// ============================================================================
// figmaGetFileNodes
// ============================================================================

describe('figmaGetFileNodes', () => {
  it('sends GET with ids query param', async () => {
    const mock = mockFetchOk({ nodes: { '1:2': { document: { id: '1:2', name: 'Frame', type: 'FRAME' } } } });
    vi.stubGlobal('fetch', mock);

    await figmaGetFileNodes(makeClient(), 'fileKey', ['1:2', '3:4']);

    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain('/files/fileKey/nodes?ids=');
    expect(url).toContain(encodeURIComponent('1:2,3:4'));
  });

  it('returns the nodes map', async () => {
    const nodesResponse = {
      nodes: {
        '1:2': { document: { id: '1:2', name: 'Header', type: 'FRAME' } },
        '3:4': { document: { id: '3:4', name: 'Footer', type: 'FRAME' } },
      },
    };
    vi.stubGlobal('fetch', mockFetchOk(nodesResponse));

    const result = await figmaGetFileNodes(makeClient(), 'key', ['1:2', '3:4']);
    expect(result['1:2'].document.name).toBe('Header');
    expect(result['3:4'].document.name).toBe('Footer');
  });

  it('throws on failure', async () => {
    vi.stubGlobal('fetch', mockFetchError(500, 'Server error'));

    await expect(
      figmaGetFileNodes(makeClient(), 'key', ['1:1'])
    ).rejects.toThrow('Figma get nodes failed (500)');
  });
});

// ============================================================================
// figmaGetImages
// ============================================================================

describe('figmaGetImages', () => {
  const imageResponse = {
    images: { '1:2': 'https://figma-render.s3.amazonaws.com/img1.png' },
    err: null,
  };

  it('sends GET with ids, format, and scale params', async () => {
    const mock = mockFetchOk(imageResponse);
    vi.stubGlobal('fetch', mock);

    await figmaGetImages(makeClient(), 'fileKey', ['1:2'], { format: 'svg', scale: 3 });

    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain('/images/fileKey');
    expect(url).toContain('format=svg');
    expect(url).toContain('scale=3');
    expect(url).toContain(encodeURIComponent('1:2'));
  });

  it('defaults to png format and scale 2', async () => {
    const mock = mockFetchOk(imageResponse);
    vi.stubGlobal('fetch', mock);

    await figmaGetImages(makeClient(), 'fileKey', ['1:2']);

    const url = mock.mock.calls[0][0] as string;
    expect(url).toContain('format=png');
    expect(url).toContain('scale=2');
  });

  it('returns image URLs', async () => {
    vi.stubGlobal('fetch', mockFetchOk(imageResponse));

    const result = await figmaGetImages(makeClient(), 'key', ['1:2']);
    expect(result.images['1:2']).toContain('figma-render');
    expect(result.err).toBeNull();
  });

  it('throws on rate limiting (429)', async () => {
    vi.stubGlobal('fetch', mockFetchError(429, 'Rate limited'));

    await expect(
      figmaGetImages(makeClient(), 'key', ['1:2'])
    ).rejects.toThrow('Figma get images failed (429)');
  });
});

// ============================================================================
// figmaDownloadImage
// ============================================================================

describe('figmaDownloadImage', () => {
  it('fetches the provided image URL', async () => {
    const mockArrayBuffer = new ArrayBuffer(16);
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mockArrayBuffer,
    });
    vi.stubGlobal('fetch', mock);

    await figmaDownloadImage('https://cdn.figma.com/img.png');

    expect(mock.mock.calls[0][0]).toBe('https://cdn.figma.com/img.png');
  });

  it('returns a Buffer', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bytes,
    }));

    const result = await figmaDownloadImage('https://cdn.figma.com/img.png');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(4);
  });

  it('throws on download failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(
      figmaDownloadImage('https://cdn.figma.com/missing.png')
    ).rejects.toThrow('Figma image download failed (404)');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    await expect(
      figmaDownloadImage('https://cdn.figma.com/img.png')
    ).rejects.toThrow('ECONNRESET');
  });
});

// ============================================================================
// figmaExtractSections
// ============================================================================

describe('figmaExtractSections', () => {
  it('extracts FRAME children as sections sorted by y position', () => {
    const page: FigmaNode = {
      id: '0:1',
      name: 'Page 1',
      type: 'CANVAS',
      children: [
        { id: '1:1', name: 'Footer', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 2000, width: 1440, height: 300 } },
        { id: '1:2', name: 'Header', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 100 } },
        { id: '1:3', name: 'Hero', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 100, width: 1440, height: 600 } },
      ],
    };

    const sections = figmaExtractSections(page);
    expect(sections).toHaveLength(3);
    expect(sections[0].name).toBe('Header');
    expect(sections[1].name).toBe('Hero');
    expect(sections[2].name).toBe('Footer');
  });

  it('includes COMPONENT and SECTION type children', () => {
    const page: FigmaNode = {
      id: '0:1',
      name: 'Page',
      type: 'CANVAS',
      children: [
        { id: '1:1', name: 'Nav', type: 'COMPONENT', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 } },
        { id: '1:2', name: 'Block', type: 'SECTION', absoluteBoundingBox: { x: 0, y: 60, width: 100, height: 200 } },
      ],
    };

    const sections = figmaExtractSections(page);
    expect(sections).toHaveLength(2);
    expect(sections[0].type).toBe('COMPONENT');
    expect(sections[1].type).toBe('SECTION');
  });

  it('filters out invisible children (visible=false)', () => {
    const page: FigmaNode = {
      id: '0:1',
      name: 'Page',
      type: 'CANVAS',
      children: [
        { id: '1:1', name: 'Visible', type: 'FRAME', visible: true, absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 50 } },
        { id: '1:2', name: 'Hidden', type: 'FRAME', visible: false, absoluteBoundingBox: { x: 0, y: 60, width: 100, height: 50 } },
      ],
    };

    const sections = figmaExtractSections(page);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('Visible');
  });

  it('excludes non-frame/section/component types like TEXT and GROUP', () => {
    const page: FigmaNode = {
      id: '0:1',
      name: 'Page',
      type: 'CANVAS',
      children: [
        { id: '1:1', name: 'Text Node', type: 'TEXT' },
        { id: '1:2', name: 'Some Group', type: 'GROUP' },
        { id: '1:3', name: 'Real Frame', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 } },
      ],
    };

    const sections = figmaExtractSections(page);
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('Real Frame');
  });

  it('returns empty array when page has no children', () => {
    const page: FigmaNode = { id: '0:1', name: 'Empty', type: 'CANVAS' };

    const sections = figmaExtractSections(page);
    expect(sections).toEqual([]);
  });

  it('provides default bounds when absoluteBoundingBox is missing', () => {
    const page: FigmaNode = {
      id: '0:1',
      name: 'Page',
      type: 'CANVAS',
      children: [
        { id: '1:1', name: 'NoBounds', type: 'FRAME' },
      ],
    };

    const sections = figmaExtractSections(page);
    expect(sections[0].bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

// ============================================================================
// figmaExtractColors
// ============================================================================

describe('figmaExtractColors', () => {
  it('extracts SOLID fill colors and returns hex values', () => {
    const node: FigmaNode = {
      id: '1:1',
      name: 'ColorBox',
      type: 'RECTANGLE',
      fills: [
        { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } },
      ],
    };

    const colors = figmaExtractColors(node);
    expect(colors).toHaveLength(1);
    expect(colors[0].hex).toBe('#ff0000');
    expect(colors[0].rgba).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it('walks children recursively', () => {
    const node: FigmaNode = {
      id: '0:0',
      name: 'Root',
      type: 'FRAME',
      children: [
        {
          id: '1:1',
          name: 'Child',
          type: 'RECTANGLE',
          fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 } }],
        },
      ],
    };

    const colors = figmaExtractColors(node);
    expect(colors).toHaveLength(1);
    expect(colors[0].hex).toBe('#0000ff');
  });

  it('deduplicates colors by hex value', () => {
    const node: FigmaNode = {
      id: '0:0',
      name: 'Root',
      type: 'FRAME',
      children: [
        { id: '1:1', name: 'Box1', type: 'RECTANGLE', fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }] },
        { id: '1:2', name: 'Box2', type: 'RECTANGLE', fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }] },
      ],
    };

    const colors = figmaExtractColors(node);
    expect(colors).toHaveLength(1);
  });

  it('ignores non-SOLID fills (e.g. GRADIENT, IMAGE)', () => {
    const node: FigmaNode = {
      id: '1:1',
      name: 'GradientBox',
      type: 'RECTANGLE',
      fills: [
        { type: 'GRADIENT_LINEAR', color: { r: 1, g: 0, b: 0, a: 1 } },
        { type: 'IMAGE', imageRef: 'ref123' },
      ],
    };

    const colors = figmaExtractColors(node);
    expect(colors).toHaveLength(0);
  });

  it('includes alpha channel in hex when opacity < 1', () => {
    const node: FigmaNode = {
      id: '1:1',
      name: 'SemiTransparent',
      type: 'RECTANGLE',
      fills: [
        { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 0.5 } },
      ],
    };

    const colors = figmaExtractColors(node);
    expect(colors[0].hex).toMatch(/^#000000[0-9a-f]{2}$/);
  });

  it('returns empty array for node with no fills', () => {
    const node: FigmaNode = { id: '1:1', name: 'Empty', type: 'FRAME' };

    const colors = figmaExtractColors(node);
    expect(colors).toEqual([]);
  });
});

// ============================================================================
// figmaExtractTypography
// ============================================================================

describe('figmaExtractTypography', () => {
  it('extracts font family, weight, and size from TEXT nodes', () => {
    const node: FigmaNode = {
      id: '0:0',
      name: 'Root',
      type: 'FRAME',
      children: [
        {
          id: '1:1',
          name: 'Heading',
          type: 'TEXT',
          characters: 'Hello',
          style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 32, lineHeightPx: 40 },
        },
      ],
    };

    const fonts = figmaExtractTypography(node);
    expect(fonts).toHaveLength(1);
    expect(fonts[0].family).toBe('Inter');
    expect(fonts[0].weight).toBe(700);
    expect(fonts[0].size).toBe(32);
    expect(fonts[0].lineHeight).toBe(40);
  });

  it('deduplicates by family-weight-size key', () => {
    const node: FigmaNode = {
      id: '0:0',
      name: 'Root',
      type: 'FRAME',
      children: [
        { id: '1:1', name: 'Text1', type: 'TEXT', style: { fontFamily: 'Inter', fontWeight: 400, fontSize: 16 } },
        { id: '1:2', name: 'Text2', type: 'TEXT', style: { fontFamily: 'Inter', fontWeight: 400, fontSize: 16 } },
      ],
    };

    const fonts = figmaExtractTypography(node);
    expect(fonts).toHaveLength(1);
  });

  it('captures multiple distinct fonts', () => {
    const node: FigmaNode = {
      id: '0:0',
      name: 'Root',
      type: 'FRAME',
      children: [
        { id: '1:1', name: 'H1', type: 'TEXT', style: { fontFamily: 'Poppins', fontWeight: 700, fontSize: 48 } },
        { id: '1:2', name: 'Body', type: 'TEXT', style: { fontFamily: 'Open Sans', fontWeight: 400, fontSize: 16 } },
      ],
    };

    const fonts = figmaExtractTypography(node);
    expect(fonts).toHaveLength(2);
    const families = fonts.map(f => f.family);
    expect(families).toContain('Poppins');
    expect(families).toContain('Open Sans');
  });

  it('uses defaults when style properties are missing', () => {
    const node: FigmaNode = {
      id: '0:0',
      name: 'Root',
      type: 'FRAME',
      children: [
        { id: '1:1', name: 'Bare', type: 'TEXT', style: {} },
      ],
    };

    const fonts = figmaExtractTypography(node);
    expect(fonts).toHaveLength(1);
    expect(fonts[0].family).toBe('sans-serif');
    expect(fonts[0].weight).toBe(400);
    expect(fonts[0].size).toBe(16);
    expect(fonts[0].lineHeight).toBeUndefined();
  });

  it('ignores non-TEXT nodes even if they have a style', () => {
    const node: FigmaNode = {
      id: '0:0',
      name: 'Root',
      type: 'FRAME',
      children: [
        { id: '1:1', name: 'NotText', type: 'RECTANGLE', style: { fontFamily: 'Arial', fontSize: 14, fontWeight: 400 } },
      ],
    };

    const fonts = figmaExtractTypography(node);
    expect(fonts).toEqual([]);
  });

  it('returns empty for node with no text children', () => {
    const node: FigmaNode = { id: '0:0', name: 'Empty', type: 'FRAME' };
    expect(figmaExtractTypography(node)).toEqual([]);
  });
});

// ============================================================================
// figmaParseUrl
// ============================================================================

describe('figmaParseUrl', () => {
  it('extracts fileKey from /file/ URL format', () => {
    const result = figmaParseUrl('https://www.figma.com/file/ABC123xyz/My-Design');
    expect(result).not.toBeNull();
    expect(result!.fileKey).toBe('ABC123xyz');
  });

  it('extracts fileKey from /design/ URL format', () => {
    const result = figmaParseUrl('https://www.figma.com/design/XYZ789/Landing-Page');
    expect(result).not.toBeNull();
    expect(result!.fileKey).toBe('XYZ789');
  });

  it('extracts nodeId from URL with node-id param', () => {
    const result = figmaParseUrl('https://www.figma.com/file/ABC123/Design?node-id=1%3A2');
    expect(result).not.toBeNull();
    expect(result!.fileKey).toBe('ABC123');
    expect(result!.nodeId).toBe('1:2');
  });

  it('handles URL without node-id param', () => {
    const result = figmaParseUrl('https://www.figma.com/file/ABC123/Design');
    expect(result!.nodeId).toBeUndefined();
  });

  it('returns null for non-Figma URLs', () => {
    expect(figmaParseUrl('https://google.com/file/ABC123')).toBeNull();
    expect(figmaParseUrl('https://figma.com/about')).toBeNull();
    expect(figmaParseUrl('not a url at all')).toBeNull();
  });

  it('handles figma.com without www', () => {
    const result = figmaParseUrl('https://figma.com/file/KEY99/Name');
    expect(result).not.toBeNull();
    expect(result!.fileKey).toBe('KEY99');
  });

  it('handles node-id with additional query params', () => {
    const result = figmaParseUrl('https://www.figma.com/design/ABC/Name?node-id=10%3A20&t=something');
    expect(result!.nodeId).toBe('10:20');
  });
});

// ============================================================================
// figmaTestConnection
// ============================================================================

describe('figmaTestConnection', () => {
  it('returns ok:true with email on successful /me call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ email: 'designer@example.com', handle: 'designer' }),
    }));

    const result = await figmaTestConnection(TEST_TOKEN);

    expect(result.ok).toBe(true);
    expect(result.email).toBe('designer@example.com');
    expect(result.error).toBeUndefined();
  });

  it('calls the /me endpoint with the token', async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ email: 'test@test.com' }),
    });
    vi.stubGlobal('fetch', mock);

    await figmaTestConnection(TEST_TOKEN);

    const url = mock.mock.calls[0][0];
    expect(url).toBe(`${FIGMA_BASE}/me`);
    const headers = mock.mock.calls[0][1].headers;
    expect(headers['X-Figma-Token']).toBe(TEST_TOKEN);
  });

  it('returns ok:false on auth failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    }));

    const result = await figmaTestConnection('bad-token');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('403');
  });

  it('returns ok:false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS lookup failed')));

    const result = await figmaTestConnection(TEST_TOKEN);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('DNS lookup failed');
  });

  it('handles non-Error thrown values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('raw error string'));

    const result = await figmaTestConnection(TEST_TOKEN);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('raw error string');
  });
});

// ============================================================================
// Error handling across all API functions
// ============================================================================

describe('error handling', () => {
  it('figmaGetFile throws on rate limiting (429)', async () => {
    vi.stubGlobal('fetch', mockFetchError(429, 'Rate limit exceeded'));

    await expect(figmaGetFile(makeClient(), 'key')).rejects.toThrow('(429)');
  });

  it('figmaGetFileNodes throws on invalid token (403)', async () => {
    vi.stubGlobal('fetch', mockFetchError(403, 'Forbidden'));

    await expect(
      figmaGetFileNodes(makeClient(), 'key', ['1:1'])
    ).rejects.toThrow('(403)');
  });

  it('figmaGetImages throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')));

    await expect(
      figmaGetImages(makeClient(), 'key', ['1:1'])
    ).rejects.toThrow('Network timeout');
  });
});
