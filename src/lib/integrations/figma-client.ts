// ============================================================================
// FIGMA REST API CLIENT
// Read-only access to Figma files for design extraction.
// Uses Personal Access Tokens for authentication.
// ============================================================================

const FIGMA_API_BASE = 'https://api.figma.com/v1';

export interface FigmaClient {
  token: string;
  headers: Record<string, string>;
}

export interface FigmaFile {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponent>;
  styles: Record<string, FigmaStyle>;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills?: FigmaFill[];
  strokes?: FigmaFill[];
  effects?: FigmaEffect[];
  style?: FigmaTextStyle;
  characters?: string;
  constraints?: { vertical: string; horizontal: string };
  layoutMode?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  cornerRadius?: number;
  opacity?: number;
  visible?: boolean;
  clipsContent?: boolean;
  exportSettings?: FigmaExportSetting[];
}

export interface FigmaFill {
  type: string;
  color?: { r: number; g: number; b: number; a: number };
  opacity?: number;
  imageRef?: string;
  scaleMode?: string;
  gradientHandlePositions?: Array<{ x: number; y: number }>;
  gradientStops?: Array<{ color: { r: number; g: number; b: number; a: number }; position: number }>;
}

export interface FigmaEffect {
  type: string;
  visible: boolean;
  radius?: number;
  color?: { r: number; g: number; b: number; a: number };
  offset?: { x: number; y: number };
  spread?: number;
}

export interface FigmaTextStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
  textAlignHorizontal?: string;
  textCase?: string;
  textDecoration?: string;
}

export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
}

export interface FigmaStyle {
  key: string;
  name: string;
  styleType: string;
  description: string;
}

export interface FigmaExportSetting {
  suffix: string;
  format: string;
  constraint: { type: string; value: number };
}

export interface FigmaImageResponse {
  images: Record<string, string | null>;
  err: string | null;
}

export interface FigmaSection {
  id: string;
  name: string;
  type: string;
  bounds: { x: number; y: number; width: number; height: number };
  children: FigmaNode[];
  node: FigmaNode;
}

export interface FigmaDesignTokens {
  colors: Array<{ name: string; hex: string; rgba: { r: number; g: number; b: number; a: number } }>;
  fonts: Array<{ family: string; weight: number; size: number; lineHeight?: number }>;
}

// ============================================================================
// CLIENT FACTORY
// ============================================================================

export function createFigmaClient(token: string): FigmaClient {
  return {
    token,
    headers: {
      'X-Figma-Token': token,
    },
  };
}

// ============================================================================
// FILE & NODE FETCHING
// ============================================================================

export async function figmaGetFile(client: FigmaClient, fileKey: string): Promise<FigmaFile> {
  const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}`, {
    headers: client.headers,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Figma get file failed (${res.status}): ${err}`);
  }

  return res.json();
}

export async function figmaGetFileNodes(
  client: FigmaClient,
  fileKey: string,
  nodeIds: string[]
): Promise<Record<string, { document: FigmaNode }>> {
  const ids = nodeIds.join(',');
  const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`, {
    headers: client.headers,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Figma get nodes failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.nodes;
}

// ============================================================================
// IMAGE EXPORT
// ============================================================================

export async function figmaGetImages(
  client: FigmaClient,
  fileKey: string,
  nodeIds: string[],
  options?: { format?: 'png' | 'jpg' | 'svg' | 'pdf'; scale?: number }
): Promise<FigmaImageResponse> {
  const format = options?.format || 'png';
  const scale = options?.scale || 2;
  const BATCH_SIZE = 5;

  // Batch node IDs to avoid Figma render timeouts on large/complex designs
  const allImages: Record<string, string | null> = {};

  for (let i = 0; i < nodeIds.length; i += BATCH_SIZE) {
    const batch = nodeIds.slice(i, i + BATCH_SIZE);
    const ids = batch.join(',');

    const res = await fetch(
      `${FIGMA_API_BASE}/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
      {
        headers: client.headers,
        signal: AbortSignal.timeout(60000),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Figma get images failed (${res.status}): ${err}`);
    }

    const data: FigmaImageResponse = await res.json();
    Object.assign(allImages, data.images || {});

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < nodeIds.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { err: null, images: allImages };
}

export async function figmaDownloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });

  if (!res.ok) {
    throw new Error(`Figma image download failed (${res.status})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ============================================================================
// DESIGN ANALYSIS
// ============================================================================

/**
 * Extract top-level frames as page sections from a Figma page/frame node.
 */
export function figmaExtractSections(pageNode: FigmaNode): FigmaSection[] {
  const children = pageNode.children || [];

  return children
    .filter(child => child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'SECTION')
    .filter(child => child.visible !== false)
    .map(child => ({
      id: child.id,
      name: child.name,
      type: child.type,
      bounds: child.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 },
      children: child.children || [],
      node: child,
    }))
    .sort((a, b) => a.bounds.y - b.bounds.y); // Sort top-to-bottom
}

/**
 * Extract color palette from a design tree.
 */
export function figmaExtractColors(node: FigmaNode): FigmaDesignTokens['colors'] {
  const colors: Map<string, FigmaDesignTokens['colors'][0]> = new Map();

  function walk(n: FigmaNode) {
    if (n.fills) {
      for (const fill of n.fills) {
        if (fill.type === 'SOLID' && fill.color) {
          const { r, g, b, a } = fill.color;
          const hex = rgbaToHex(r, g, b, a);
          if (!colors.has(hex)) {
            colors.set(hex, { name: n.name, hex, rgba: { r, g, b, a } });
          }
        }
      }
    }
    if (n.children) {
      for (const child of n.children) walk(child);
    }
  }

  walk(node);
  return Array.from(colors.values());
}

/**
 * Extract unique typography styles from a design tree.
 */
export function figmaExtractTypography(node: FigmaNode): FigmaDesignTokens['fonts'] {
  const fonts: Map<string, FigmaDesignTokens['fonts'][0]> = new Map();

  function walk(n: FigmaNode) {
    if (n.type === 'TEXT' && n.style) {
      const key = `${n.style.fontFamily}-${n.style.fontWeight}-${n.style.fontSize}`;
      if (!fonts.has(key)) {
        fonts.set(key, {
          family: n.style.fontFamily || 'sans-serif',
          weight: n.style.fontWeight || 400,
          size: n.style.fontSize || 16,
          lineHeight: n.style.lineHeightPx,
        });
      }
    }
    if (n.children) {
      for (const child of n.children) walk(child);
    }
  }

  walk(node);
  return Array.from(fonts.values());
}

/**
 * Extract Figma file key from a URL.
 * Handles URLs like:
 *   https://www.figma.com/file/ABC123/My-Design
 *   https://www.figma.com/design/ABC123/My-Design
 */
export function figmaParseUrl(url: string): { fileKey: string; nodeId?: string } | null {
  const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!match) return null;

  const fileKey = match[1];
  const nodeMatch = url.match(/node-id=([^&]+)/);
  const nodeId = nodeMatch ? decodeURIComponent(nodeMatch[1]) : undefined;

  return { fileKey, nodeId };
}

/**
 * Test Figma token by fetching user info.
 */
export async function figmaTestConnection(token: string): Promise<{
  ok: boolean;
  email?: string;
  error?: string;
}> {
  try {
    const client = createFigmaClient(token);
    const res = await fetch(`${FIGMA_API_BASE}/me`, {
      headers: client.headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { ok: false, error: `Figma auth failed: ${res.status}` };
    }

    const data = await res.json();
    return { ok: true, email: data.email };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (a < 1) return `${hex}${toHex(a)}`;
  return hex;
}
