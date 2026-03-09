import { SupabaseClient } from '@supabase/supabase-js';
import { encryptToHex, decryptFromHex } from '../encryption';

// ============================================================================
// SLACK SEO - OAuth Token Management & Image Fetching
// Scoped ONLY to SEO tasks: token rotation, channel image fetching, messaging
// ============================================================================

const SLACK_TOKEN_ROTATE_URL = 'https://slack.com/api/tooling.tokens.rotate';
const SLACK_API_BASE = 'https://slack.com/api';

// Token expiry buffer - refresh 5 minutes before actual expiry
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// Default token lifetime when not specified (12 hours)
const DEFAULT_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

// ============================================================================
// Types
// ============================================================================

export interface SlackCredentials {
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
  channel_id: string;
  team_id?: string;
  scope?: string;
}

export interface SlackTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface SlackChannelImage {
  url: string;
  filename: string;
  timestamp: string;
  messageText: string;
}

interface StoreSlackTokensParams {
  accessToken: string;
  refreshToken: string;
  channelId: string;
  teamId?: string;
  scope?: string;
  expiresInSeconds?: number;
}

// ============================================================================
// Token Storage
// ============================================================================

/**
 * Encrypts and stores Slack tokens in seo_team_configs.slack_credentials.
 */
export async function storeSlackTokens(
  supabase: SupabaseClient,
  configId: string,
  params: StoreSlackTokensParams
): Promise<void> {
  const {
    accessToken,
    refreshToken,
    channelId,
    teamId,
    scope,
    expiresInSeconds = DEFAULT_TOKEN_LIFETIME_SECONDS,
  } = params;

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  const credentials: SlackCredentials = {
    access_token_encrypted: encryptToHex(accessToken),
    refresh_token_encrypted: encryptToHex(refreshToken),
    token_expires_at: expiresAt.toISOString(),
    channel_id: channelId,
    ...(teamId && { team_id: teamId }),
    ...(scope && { scope }),
  };

  const { error } = await supabase
    .from('seo_team_configs')
    .update({ slack_credentials: credentials })
    .eq('id', configId);

  if (error) {
    throw new Error(`Failed to store Slack tokens for config ${configId}: ${error.message}`);
  }
}

// ============================================================================
// Token Refresh
// ============================================================================

/**
 * Calls Slack's tooling.tokens.rotate endpoint to refresh a rotating token.
 * Both access_token and refresh_token rotate on each call - the old refresh
 * token is invalidated immediately.
 *
 * Returns new plaintext tokens (caller is responsible for encrypting/storing).
 */
export async function refreshSlackToken(
  refreshTokenEncrypted: string
): Promise<SlackTokenPair> {
  const clientId = process.env.SLACK_SEO_CLIENT_ID?.trim();
  const clientSecret = process.env.SLACK_SEO_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      'SLACK_SEO_CLIENT_ID and SLACK_SEO_CLIENT_SECRET environment variables must be set'
    );
  }

  const refreshToken = decryptFromHex(refreshTokenEncrypted);

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const res = await fetch(SLACK_TOKEN_ROTATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Slack token rotate HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();

  if (!data.ok) {
    throw new Error(`Slack token rotate failed: ${data.error || 'unknown error'}`);
  }

  if (!data.token || !data.refresh_token) {
    throw new Error('Slack token rotate response missing token or refresh_token');
  }

  // Slack rotating tokens include exp in the response, default to 12h if missing
  const expiresInSeconds = data.exp
    ? data.exp - Math.floor(Date.now() / 1000)
    : DEFAULT_TOKEN_LIFETIME_SECONDS;

  return {
    accessToken: data.token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

// ============================================================================
// Get Valid Token (with auto-refresh)
// ============================================================================

/**
 * Gets a valid (non-expired) Slack access token for a given SEO config.
 * Checks expiry with a 5-minute buffer and refreshes if needed.
 * On refresh, both new tokens are saved back to the DB.
 *
 * Returns the decrypted access token string, or null if no credentials exist.
 */
export async function getValidSlackToken(
  supabase: SupabaseClient,
  configId: string
): Promise<string | null> {
  const { data: config, error } = await supabase
    .from('seo_team_configs')
    .select('slack_credentials')
    .eq('id', configId)
    .single();

  if (error || !config) {
    return null;
  }

  const creds = config.slack_credentials as SlackCredentials | null;
  if (!creds || !creds.access_token_encrypted || !creds.refresh_token_encrypted) {
    return null;
  }

  // Check if the current token is still valid (with 5-min buffer)
  if (creds.token_expires_at) {
    const expiresAt = new Date(creds.token_expires_at);
    if (expiresAt.getTime() > Date.now() + EXPIRY_BUFFER_MS) {
      try {
        return decryptFromHex(creds.access_token_encrypted);
      } catch {
        // Decryption failed, fall through to refresh
      }
    }
  }

  // Token is expired or about to expire - refresh it
  try {
    const newTokens = await refreshSlackToken(creds.refresh_token_encrypted);

    // Save both new tokens to DB (both rotate on each refresh)
    const updatedCredentials: SlackCredentials = {
      ...creds,
      access_token_encrypted: encryptToHex(newTokens.accessToken),
      refresh_token_encrypted: encryptToHex(newTokens.refreshToken),
      token_expires_at: newTokens.expiresAt.toISOString(),
    };

    await supabase
      .from('seo_team_configs')
      .update({ slack_credentials: updatedCredentials })
      .eq('id', configId);

    return newTokens.accessToken;
  } catch (err: any) {
    // Token refresh failed - credentials may be revoked
    // Update the config with the error but don't wipe credentials
    // (the refresh token might still work on retry)
    console.error(`Slack token refresh failed for config ${configId}:`, err.message);
    return null;
  }
}

// ============================================================================
// Fetch Channel Images (SEO-scoped Slack API access)
// ============================================================================

/**
 * Fetches images from a Slack channel using conversations.history + files.list.
 * This is the ONLY Slack data-reading API operation allowed - scoped to SEO
 * image fetching.
 *
 * Returns an array of image objects with URL, filename, timestamp, and the
 * message text that accompanied the image.
 */
export async function fetchSlackChannelImages(
  supabase: SupabaseClient,
  configId: string,
  channelId: string,
  options?: { limit?: number; oldest?: string }
): Promise<SlackChannelImage[]> {
  const accessToken = await getValidSlackToken(supabase, configId);
  if (!accessToken) {
    throw new Error(`No valid Slack token available for config ${configId}`);
  }

  const limit = options?.limit ?? 100;
  const images: SlackChannelImage[] = [];

  // Strategy 1: conversations.history to find messages with file attachments
  const historyParams = new URLSearchParams({
    channel: channelId,
    limit: String(Math.min(limit * 2, 200)), // fetch more messages since not all have images
  });
  if (options?.oldest) {
    historyParams.set('oldest', options.oldest);
  }

  const historyRes = await fetch(
    `${SLACK_API_BASE}/conversations.history?${historyParams}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!historyRes.ok) {
    const text = await historyRes.text();
    throw new Error(`Slack conversations.history HTTP ${historyRes.status}: ${text}`);
  }

  const historyData = await historyRes.json();
  if (!historyData.ok) {
    throw new Error(`Slack conversations.history failed: ${historyData.error || 'unknown'}`);
  }

  // Extract images from message file attachments
  const messages: any[] = historyData.messages || [];
  for (const msg of messages) {
    if (images.length >= limit) break;

    const files: any[] = msg.files || [];
    for (const file of files) {
      if (images.length >= limit) break;

      // Only include image files
      if (file.mimetype && file.mimetype.startsWith('image/')) {
        images.push({
          url: file.url_private || file.url_private_download || file.permalink,
          filename: file.name || file.title || 'unknown',
          timestamp: msg.ts || '',
          messageText: msg.text || '',
        });
      }
    }
  }

  // Strategy 2: files.list as a supplementary source if we haven't hit the limit
  if (images.length < limit) {
    const filesParams = new URLSearchParams({
      channel: channelId,
      types: 'images',
      count: String(limit - images.length),
    });
    if (options?.oldest) {
      filesParams.set('ts_from', options.oldest);
    }

    const filesRes = await fetch(
      `${SLACK_API_BASE}/files.list?${filesParams}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (filesRes.ok) {
      const filesData = await filesRes.json();
      if (filesData.ok) {
        const existingUrls = new Set(images.map((img) => img.url));

        for (const file of filesData.files || []) {
          if (images.length >= limit) break;

          const fileUrl = file.url_private || file.url_private_download || file.permalink;
          if (fileUrl && !existingUrls.has(fileUrl)) {
            images.push({
              url: fileUrl,
              filename: file.name || file.title || 'unknown',
              timestamp: file.timestamp ? String(file.timestamp) : '',
              messageText: file.initial_comment?.comment || '',
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
// Send Message (for image request agent)
// ============================================================================

/**
 * Sends a message to a Slack channel using chat.postMessage.
 * Used by the image request agent to ask for images in the SEO channel.
 * Optionally replies in a thread if threadTs is provided.
 */
export async function sendSlackMessage(
  supabase: SupabaseClient,
  configId: string,
  channelId: string,
  text: string,
  threadTs?: string
): Promise<{ ok: boolean; ts: string; channel: string }> {
  const accessToken = await getValidSlackToken(supabase, configId);
  if (!accessToken) {
    throw new Error(`No valid Slack token available for config ${configId}`);
  }

  const payload: Record<string, string> = {
    channel: channelId,
    text,
  };
  if (threadTs) {
    payload.thread_ts = threadTs;
  }

  const res = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const responseText = await res.text();
    throw new Error(`Slack chat.postMessage HTTP ${res.status}: ${responseText}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack chat.postMessage failed: ${data.error || 'unknown'}`);
  }

  return {
    ok: true,
    ts: data.ts,
    channel: data.channel,
  };
}
