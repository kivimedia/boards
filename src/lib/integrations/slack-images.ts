import { SupabaseClient } from '@supabase/supabase-js';
import { decryptFromHex } from '../encryption';

// ============================================================================
// SHARED SLACK IMAGE FETCHER
// Generic Slack channel image collection used by both Historian and SEO teams.
// Extracted from slack-seo.ts to eliminate duplication.
// ============================================================================

const SLACK_API_BASE = 'https://slack.com/api';

// ============================================================================
// Types
// ============================================================================

export interface SlackImageResult {
  url: string;
  filename: string;
  timestamp: string;        // Slack ts (e.g. "1773140400.123456")
  messageText: string;
  uploader?: string;        // Slack user ID who posted
  threadTs?: string;        // Thread parent ts (if in thread)
  permalink?: string;       // Slack permalink to the message
  mimeType?: string;        // e.g. "image/jpeg"
  fileSize?: number;        // bytes
}

export interface FetchSlackImagesOptions {
  limit?: number;           // Max images to return (default 100)
  oldest?: string;          // Slack ts - only fetch messages after this
  newest?: string;          // Slack ts - only fetch messages before this
}

// ============================================================================
// Core: Fetch images from any Slack channel
// ============================================================================

/**
 * Fetches images from a Slack channel using dual strategy:
 * 1. conversations.history - gets messages with file attachments
 * 2. files.list - supplements with any images not caught by strategy 1
 *
 * Returns enriched metadata for each image.
 */
export async function fetchSlackImages(
  accessToken: string,
  channelId: string,
  options?: FetchSlackImagesOptions,
): Promise<SlackImageResult[]> {
  const limit = options?.limit ?? 100;
  const images: SlackImageResult[] = [];

  // Strategy 1: conversations.history to find messages with file attachments
  const historyParams = new URLSearchParams({
    channel: channelId,
    limit: String(Math.min(limit * 2, 200)),
  });
  if (options?.oldest) historyParams.set('oldest', options.oldest);
  if (options?.newest) historyParams.set('latest', options.newest);

  const historyRes = await fetch(
    `${SLACK_API_BASE}/conversations.history?${historyParams}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!historyRes.ok) {
    const text = await historyRes.text();
    throw new Error(`Slack conversations.history HTTP ${historyRes.status}: ${text}`);
  }

  const historyData = await historyRes.json();
  if (!historyData.ok) {
    throw new Error(`Slack conversations.history failed: ${historyData.error || 'unknown'}`);
  }

  const messages: any[] = historyData.messages || [];
  for (const msg of messages) {
    if (images.length >= limit) break;

    const files: any[] = msg.files || [];
    for (const file of files) {
      if (images.length >= limit) break;

      if (file.mimetype && file.mimetype.startsWith('image/')) {
        images.push({
          url: file.url_private || file.url_private_download || file.permalink,
          filename: file.name || file.title || 'unknown',
          timestamp: msg.ts || '',
          messageText: msg.text || '',
          uploader: msg.user || undefined,
          threadTs: msg.thread_ts || undefined,
          permalink: file.permalink || undefined,
          mimeType: file.mimetype || undefined,
          fileSize: file.size || undefined,
        });
      }
    }
  }

  // Strategy 2: files.list as supplementary source
  if (images.length < limit) {
    const filesParams = new URLSearchParams({
      channel: channelId,
      types: 'images',
      count: String(limit - images.length),
    });
    if (options?.oldest) filesParams.set('ts_from', options.oldest);
    if (options?.newest) filesParams.set('ts_to', options.newest);

    const filesRes = await fetch(
      `${SLACK_API_BASE}/files.list?${filesParams}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (filesRes.ok) {
      const filesData = await filesRes.json();
      if (filesData.ok) {
        const existingUrls = new Set(images.map(img => img.url));

        for (const file of filesData.files || []) {
          if (images.length >= limit) break;

          const fileUrl = file.url_private || file.url_private_download || file.permalink;
          if (fileUrl && !existingUrls.has(fileUrl)) {
            images.push({
              url: fileUrl,
              filename: file.name || file.title || 'unknown',
              timestamp: file.timestamp ? String(file.timestamp) : '',
              messageText: file.initial_comment?.comment || '',
              uploader: file.user || undefined,
              permalink: file.permalink || undefined,
              mimeType: file.mimetype || undefined,
              fileSize: file.size || undefined,
            });
            existingUrls.add(fileUrl);
          }
        }
      }
    }
    // Silently skip files.list errors - conversations.history results are sufficient
  }

  return images;
}

// ============================================================================
// Token Resolution - abstracts over SEO and Historian config tables
// ============================================================================

/**
 * Resolve a valid Slack access token from either seo_team_configs or historian_configs.
 * For SEO configs, uses the token refresh logic from slack-seo.ts.
 * For historian configs, reads slack_credentials directly (no rotation).
 */
export async function resolveSlackToken(
  supabase: SupabaseClient,
  configId: string,
  configType: 'seo' | 'historian',
): Promise<string | null> {
  const table = configType === 'seo' ? 'seo_team_configs' : 'historian_configs';

  const { data, error } = await supabase
    .from(table)
    .select('slack_credentials')
    .eq('id', configId)
    .single();

  if (error || !data?.slack_credentials) return null;

  const creds = data.slack_credentials;

  if (!creds.access_token_encrypted) return null;

  try {
    return decryptFromHex(creds.access_token_encrypted);
  } catch {
    return null;
  }
}
