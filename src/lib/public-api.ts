import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ApiKey,
  ApiUsageLogEntry,
  Webhook,
  WebhookDelivery,
  WebhookEvent,
  RateLimitInfo,
  ApiKeyPermission,
} from './types';

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

/**
 * Generate a random API key string (returned once, then only the hash is stored).
 */
export function generateApiKey(): { raw: string; prefix: string } {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'ab_';
  for (let i = 0; i < 40; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return { raw: key, prefix: key.substring(0, 11) };
}

/**
 * Hash an API key for storage (SHA-256).
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createApiKey(
  supabase: SupabaseClient,
  params: {
    name: string;
    userId: string;
    permissions: ApiKeyPermission[];
    rateLimitPerMinute?: number;
    rateLimitPerDay?: number;
    expiresAt?: string;
  }
): Promise<{ apiKey: ApiKey; rawKey: string } | null> {
  const { raw, prefix } = generateApiKey();
  const keyHash = await hashApiKey(raw);

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      name: params.name,
      key_hash: keyHash,
      key_prefix: prefix,
      user_id: params.userId,
      permissions: params.permissions,
      rate_limit_per_minute: params.rateLimitPerMinute ?? 60,
      rate_limit_per_day: params.rateLimitPerDay ?? 10000,
      expires_at: params.expiresAt ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return { apiKey: data as ApiKey, rawKey: raw };
}

export async function getApiKeys(
  supabase: SupabaseClient,
  userId: string
): Promise<ApiKey[]> {
  const { data } = await supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return (data as ApiKey[]) ?? [];
}

export async function revokeApiKey(
  supabase: SupabaseClient,
  keyId: string
): Promise<void> {
  await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', keyId);
}

export async function deleteApiKey(
  supabase: SupabaseClient,
  keyId: string
): Promise<void> {
  await supabase.from('api_keys').delete().eq('id', keyId);
}

export async function validateApiKey(
  supabase: SupabaseClient,
  rawKey: string
): Promise<ApiKey | null> {
  const keyHash = await hashApiKey(rawKey);

  const { data } = await supabase
    .from('api_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (!data) return null;

  const apiKey = data as ApiKey;

  // Check expiration
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return null;
  }

  // Update last_used_at
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id);

  return apiKey;
}

export function hasPermission(
  apiKey: ApiKey,
  required: ApiKeyPermission
): boolean {
  return apiKey.permissions.includes(required);
}

// ============================================================================
// RATE LIMITING
// ============================================================================

export async function checkRateLimit(
  supabase: SupabaseClient,
  apiKeyId: string,
  limitPerMinute: number,
  limitPerDay: number
): Promise<{ allowed: boolean; info: RateLimitInfo }> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const { count: minuteCount } = await supabase
    .from('api_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', apiKeyId)
    .gte('created_at', oneMinuteAgo);

  const { count: dayCount } = await supabase
    .from('api_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', apiKeyId)
    .gte('created_at', dayStart.toISOString());

  const minuteUsed = minuteCount ?? 0;
  const dayUsed = dayCount ?? 0;

  const allowed = minuteUsed < limitPerMinute && dayUsed < limitPerDay;
  const resetAt = new Date(Date.now() + 60 * 1000).toISOString();

  return {
    allowed,
    info: {
      limit: limitPerMinute,
      remaining: Math.max(0, limitPerMinute - minuteUsed),
      reset_at: resetAt,
    },
  };
}

export async function logApiUsage(
  supabase: SupabaseClient,
  entry: {
    apiKeyId: string;
    endpoint: string;
    method: string;
    statusCode: number;
    responseTimeMs?: number;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  await supabase.from('api_usage_log').insert({
    api_key_id: entry.apiKeyId,
    endpoint: entry.endpoint,
    method: entry.method,
    status_code: entry.statusCode,
    response_time_ms: entry.responseTimeMs ?? null,
    ip_address: entry.ipAddress ?? null,
    user_agent: entry.userAgent ?? null,
  });
}

export async function getApiUsageStats(
  supabase: SupabaseClient,
  apiKeyId: string,
  days: number = 7
): Promise<ApiUsageLogEntry[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('api_usage_log')
    .select('*')
    .eq('api_key_id', apiKeyId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000);

  return (data as ApiUsageLogEntry[]) ?? [];
}

// ============================================================================
// WEBHOOK MANAGEMENT
// ============================================================================

export async function createWebhook(
  supabase: SupabaseClient,
  params: {
    userId: string;
    url: string;
    events: WebhookEvent[];
    description?: string;
  }
): Promise<Webhook | null> {
  // Generate HMAC secret
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const secret = 'whsec_' + Array.from(secretBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

  const { data, error } = await supabase
    .from('webhooks')
    .insert({
      user_id: params.userId,
      url: params.url,
      secret,
      events: params.events,
      description: params.description ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as Webhook;
}

export async function getWebhooks(
  supabase: SupabaseClient,
  userId: string
): Promise<Webhook[]> {
  const { data } = await supabase
    .from('webhooks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return (data as Webhook[]) ?? [];
}

export async function updateWebhook(
  supabase: SupabaseClient,
  webhookId: string,
  updates: Partial<Pick<Webhook, 'url' | 'events' | 'is_active' | 'description'>>
): Promise<Webhook | null> {
  const { data, error } = await supabase
    .from('webhooks')
    .update(updates)
    .eq('id', webhookId)
    .select()
    .single();

  if (error) return null;
  return data as Webhook;
}

export async function deleteWebhook(
  supabase: SupabaseClient,
  webhookId: string
): Promise<void> {
  await supabase.from('webhooks').delete().eq('id', webhookId);
}

// ============================================================================
// WEBHOOK DELIVERY & HMAC SIGNING
// ============================================================================

export async function signPayload(
  secret: string,
  payload: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifySignature(
  secret: string,
  payload: string,
  signature: string
): Promise<boolean> {
  const expected = await signPayload(secret, payload);
  return expected === signature;
}

export async function deliverWebhook(
  supabase: SupabaseClient,
  webhook: Webhook,
  eventType: string,
  payload: Record<string, unknown>
): Promise<WebhookDelivery | null> {
  const payloadStr = JSON.stringify(payload);
  const signature = await signPayload(webhook.secret, payloadStr);
  const startTime = Date.now();

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': eventType,
        'X-Webhook-Id': webhook.id,
      },
      body: payloadStr,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    responseStatus = response.status;
    responseBody = await response.text().catch(() => null);
    success = response.ok;
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  const responseTimeMs = Date.now() - startTime;

  const { data } = await supabase
    .from('webhook_deliveries')
    .insert({
      webhook_id: webhook.id,
      event_type: eventType,
      payload,
      response_status: responseStatus,
      response_body: responseBody,
      response_time_ms: responseTimeMs,
      success,
      error_message: errorMessage,
    })
    .select()
    .single();

  // Update webhook metadata
  if (success) {
    await supabase
      .from('webhooks')
      .update({ last_triggered_at: new Date().toISOString(), failure_count: 0 })
      .eq('id', webhook.id);
  } else {
    await supabase
      .from('webhooks')
      .update({
        last_triggered_at: new Date().toISOString(),
        failure_count: webhook.failure_count + 1,
      })
      .eq('id', webhook.id);

    // Disable webhook after 10 consecutive failures
    if (webhook.failure_count + 1 >= 10) {
      await supabase
        .from('webhooks')
        .update({ is_active: false })
        .eq('id', webhook.id);
    }
  }

  return data as WebhookDelivery | null;
}

export async function getWebhookDeliveries(
  supabase: SupabaseClient,
  webhookId: string,
  limit: number = 50
): Promise<WebhookDelivery[]> {
  const { data } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('webhook_id', webhookId)
    .order('delivered_at', { ascending: false })
    .limit(limit);

  return (data as WebhookDelivery[]) ?? [];
}

/**
 * Dispatch event to all matching webhooks for a user.
 */
export async function dispatchWebhookEvent(
  supabase: SupabaseClient,
  userId: string,
  eventType: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const webhooks = await getWebhooks(supabase, userId);
  const active = webhooks.filter((w) => w.is_active && w.events.includes(eventType));

  for (const webhook of active) {
    await deliverWebhook(supabase, webhook, eventType, {
      event: eventType,
      timestamp: new Date().toISOString(),
      ...payload,
    });
  }
}

// ============================================================================
// WEBHOOK EVENT LIST (for API docs)
// ============================================================================

export const WEBHOOK_EVENTS: { event: WebhookEvent; description: string }[] = [
  { event: 'card.created', description: 'A new card was created' },
  { event: 'card.updated', description: 'A card was updated' },
  { event: 'card.moved', description: 'A card was moved to a different column' },
  { event: 'card.deleted', description: 'A card was deleted' },
  { event: 'comment.added', description: 'A comment was added to a card' },
  { event: 'comment.deleted', description: 'A comment was deleted' },
  { event: 'label.added', description: 'A label was added to a card' },
  { event: 'label.removed', description: 'A label was removed from a card' },
  { event: 'board.created', description: 'A new board was created' },
  { event: 'board.updated', description: 'A board was updated' },
  { event: 'member.added', description: 'A member was added to a board' },
  { event: 'member.removed', description: 'A member was removed from a board' },
];
