// ============================================================================
// FIGMA REST API CLIENT (VPS copy)
// Identical to src/lib/integrations/figma-client.ts
// Self-contained: no external imports, uses global fetch.
// ============================================================================

const FIGMA_API_BASE = 'https://api.figma.com/v1';

export interface FigmaClient { token: string; headers: Record<string, string>; }
export interface FigmaFile { name: string; lastModified: string; version: string; document: FigmaNode; components: Record<string, { key: string; name: string; description: string }>; styles: Record<string, { key: string; name: string; styleType: string; description: string }>; }
export interface FigmaNode {
  id: string; name: string; type: string; children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills?: FigmaFill[]; strokes?: FigmaFill[]; effects?: FigmaEffect[];
  style?: FigmaTextStyle; characters?: string;
  constraints?: { vertical: string; horizontal: string };
  layoutMode?: string; itemSpacing?: number;
  paddingLeft?: number; paddingRight?: number; paddingTop?: number; paddingBottom?: number;
  cornerRadius?: number; opacity?: number; visible?: boolean; clipsContent?: boolean;
  exportSettings?: Array<{ suffix: string; format: string; constraint: { type: string; value: number } }>;
}
export interface FigmaFill {
  type: string; color?: { r: number; g: number; b: number; a: number }; opacity?: number;
  imageRef?: string; scaleMode?: string;
  gradientHandlePositions?: Array<{ x: number; y: number }>;
  gradientStops?: Array<{ color: { r: number; g: number; b: number; a: number }; position: number }>;
}
export interface FigmaEffect { type: string; visible: boolean; radius?: number; color?: { r: number; g: number; b: number; a: number }; offset?: { x: number; y: number }; spread?: number; }
export interface FigmaTextStyle { fontFamily?: string; fontWeight?: number; fontSize?: number; lineHeightPx?: number; letterSpacing?: number; textAlignHorizontal?: string; textCase?: string; textDecoration?: string; }
export interface FigmaImageResponse { images: Record<string, string>; err: string | null; }
export interface FigmaSection { id: string; name: string; type: string; bounds: { x: number; y: number; width: number; height: number }; children: FigmaNode[]; node: FigmaNode; }
export interface FigmaDesignTokens {
  colors: Array<{ name: string; hex: string; rgba: { r: number; g: number; b: number; a: number } }>;
  fonts: Array<{ family: string; weight: number; size: number; lineHeight?: number }>;
}

// ============================================================================
// CLIENT FACTORY
// ============================================================================

export function createFigmaClient(token: string): FigmaClient {
  return { token, headers: { 'X-Figma-Token': token } };
}

// ============================================================================
// FILE & NODE FETCHING
// ============================================================================

export async function figmaGetFile(client: FigmaClient, fileKey: string): Promise<FigmaFile> {
  const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}`, { headers: client.headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) { const err = await res.text(); throw new Error(`Figma get file failed (${res.status}): ${err}`); }
  return res.json();
}

export async function figmaGetFileNodes(
  client: FigmaClient, fileKey: string, nodeIds: string[]
): Promise<Record<string, { document: FigmaNode }>> {
  const ids = nodeIds.join(',');
  const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`, { headers: client.headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) { const err = await res.text(); throw new Error(`Figma get nodes failed (${res.status}): ${err}`); }
  const data = await res.json();
  return data.nodes;
}

// ============================================================================
// IMAGE EXPORT
// ============================================================================

export async function figmaGetImages(
  client: FigmaClient, fileKey: string, nodeIds: string[],
  options?: { format?: 'png' | 'jpg' | 'svg' | 'pdf'; scale?: number }
): Promise<FigmaImageResponse> {
  const ids = nodeIds.join(',');
  const format = options?.format || 'png';
  const scale = options?.scale || 2;
  const res = await fetch(`${FIGMA_API_BASE}/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`, { headers: client.headers, signal: AbortSignal.timeout(60000) });
  if (!res.ok) { const err = await res.text(); throw new Error(`Figma get images failed (${res.status}): ${err}`); }
  return res.json();
}

export async function figmaDownloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Figma image download failed (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ============================================================================
// DESIGN ANALYSIS
// ============================================================================

export function figmaExtractSections(pageNode: FigmaNode): FigmaSection[] {
  return (pageNode.children || [])
    .filter(child => child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'SECTION')
    .filter(child => child.visible !== false)
    .map(child => ({
      id: child.id, name: child.name, type: child.type,
      bounds: child.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 },
      children: child.children || [], node: child,
    }))
    .sort((a, b) => a.bounds.y - b.bounds.y);
}

export function figmaExtractColors(node: FigmaNode): FigmaDesignTokens['colors'] {
  const colors: Map<string, FigmaDesignTokens['colors'][0]> = new Map();
  function walk(n: FigmaNode) {
    if (n.fills) {
      for (const fill of n.fills) {
        if (fill.type === 'SOLID' && fill.color) {
          const { r, g, b, a } = fill.color;
          const hex = rgbaToHex(r, g, b, a);
          if (!colors.has(hex)) colors.set(hex, { name: n.name, hex, rgba: { r, g, b, a } });
        }
      }
    }
    if (n.children) for (const child of n.children) walk(child);
  }
  walk(node);
  return Array.from(colors.values());
}

export function figmaExtractTypography(node: FigmaNode): FigmaDesignTokens['fonts'] {
  const fonts: Map<string, FigmaDesignTokens['fonts'][0]> = new Map();
  function walk(n: FigmaNode) {
    if (n.type === 'TEXT' && n.style) {
      const key = `${n.style.fontFamily}-${n.style.fontWeight}-${n.style.fontSize}`;
      if (!fonts.has(key)) {
        fonts.set(key, {
          family: n.style.fontFamily || 'sans-serif', weight: n.style.fontWeight || 400,
          size: n.style.fontSize || 16, lineHeight: n.style.lineHeightPx,
        });
      }
    }
    if (n.children) for (const child of n.children) walk(child);
  }
  walk(node);
  return Array.from(fonts.values());
}

export async function figmaTestConnection(token: string): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const client = createFigmaClient(token);
    const res = await fetch(`${FIGMA_API_BASE}/me`, { headers: client.headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ok: false, error: `Figma auth failed: ${res.status}` };
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
  return a < 1 ? `${hex}${toHex(a)}` : hex;
}
