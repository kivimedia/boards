// ============================================================================
// WORDPRESS REST API CLIENT (VPS copy)
// Identical to src/lib/integrations/wordpress-client.ts
// Self-contained: no external imports, uses global fetch.
// ============================================================================

export interface WpClientConfig {
  restUrl: string;
  username: string;
  appPassword: string;
}

export interface WpClient {
  config: WpClientConfig;
  headers: Record<string, string>;
}

export interface WpPage {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  slug: string;
  status: string;
  link: string;
  date: string;
  modified: string;
}

export interface WpMedia {
  id: number;
  source_url: string;
  title: { rendered: string };
  alt_text: string;
  media_details: {
    width: number;
    height: number;
    file: string;
    sizes: Record<string, { source_url: string; width: number; height: number }>;
  };
}

export interface WpPlugin {
  plugin: string;
  status: 'active' | 'inactive';
  name: string;
  version: string;
}

export interface WpYoastMeta {
  metaTitle?: string;
  metaDesc?: string;
  focusKeyphrase?: string;
  ogTitle?: string;
  ogDesc?: string;
  ogImage?: string;
}

export function createWpClient(config: WpClientConfig): WpClient {
  const auth = Buffer.from(`${config.username}:${config.appPassword}`).toString('base64');
  return {
    config,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  };
}

export async function wpTestConnection(config: WpClientConfig): Promise<{
  ok: boolean; wpVersion?: string; siteName?: string; error?: string;
}> {
  try {
    const baseUrl = config.restUrl.replace(/\/wp\/v2\/?$/, '');
    const rootRes = await fetch(baseUrl, { signal: AbortSignal.timeout(10000) });
    if (!rootRes.ok) return { ok: false, error: `REST API not reachable: ${rootRes.status}` };
    const rootData = await rootRes.json();

    const client = createWpClient(config);
    const meRes = await fetch(`${config.restUrl}/users/me`, {
      headers: client.headers, signal: AbortSignal.timeout(10000),
    });
    if (!meRes.ok) return { ok: false, error: `Authentication failed: ${meRes.status}` };

    return { ok: true, wpVersion: rootData.description, siteName: rootData.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function wpCreatePage(
  client: WpClient,
  page: { title: string; content: string; slug?: string; status?: string }
): Promise<WpPage> {
  const res = await fetch(`${client.config.restUrl}/pages`, {
    method: 'POST', headers: client.headers,
    body: JSON.stringify({ title: page.title, content: page.content, slug: page.slug, status: page.status || 'draft' }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`WP create page failed (${res.status}): ${err}`); }
  return res.json();
}

export async function wpUpdatePage(
  client: WpClient, pageId: number,
  updates: { title?: string; content?: string; slug?: string; status?: string }
): Promise<WpPage> {
  const res = await fetch(`${client.config.restUrl}/pages/${pageId}`, {
    method: 'PUT', headers: client.headers, body: JSON.stringify(updates),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`WP update page failed (${res.status}): ${err}`); }
  return res.json();
}

export async function wpUploadMedia(
  client: WpClient, buffer: Buffer, filename: string, mimeType: string
): Promise<WpMedia> {
  const res = await fetch(`${client.config.restUrl}/media`, {
    method: 'POST',
    headers: {
      'Authorization': client.headers['Authorization'],
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`WP media upload failed (${res.status}): ${err}`); }
  return res.json();
}

export async function wpGetPluginList(client: WpClient): Promise<WpPlugin[]> {
  const res = await fetch(`${client.config.restUrl}/plugins`, { headers: client.headers });
  if (!res.ok) return [];
  return res.json();
}

export async function wpIsPluginActive(client: WpClient, pluginSlug: string): Promise<boolean> {
  const plugins = await wpGetPluginList(client);
  return plugins.some(p => p.plugin.includes(pluginSlug) && p.status === 'active');
}

export async function wpUpdateYoast(client: WpClient, pageId: number, meta: WpYoastMeta): Promise<void> {
  const yoastMeta: Record<string, string> = {};
  if (meta.metaTitle) yoastMeta['yoast_wpseo_title'] = meta.metaTitle;
  if (meta.metaDesc) yoastMeta['yoast_wpseo_metadesc'] = meta.metaDesc;
  if (meta.focusKeyphrase) yoastMeta['yoast_wpseo_focuskw'] = meta.focusKeyphrase;
  if (meta.ogTitle) yoastMeta['yoast_wpseo_opengraph-title'] = meta.ogTitle;
  if (meta.ogDesc) yoastMeta['yoast_wpseo_opengraph-description'] = meta.ogDesc;
  if (meta.ogImage) yoastMeta['yoast_wpseo_opengraph-image'] = meta.ogImage;

  const res = await fetch(`${client.config.restUrl}/pages/${pageId}`, {
    method: 'POST', headers: client.headers, body: JSON.stringify({ meta: yoastMeta }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`WP Yoast update failed (${res.status}): ${err}`); }
}
