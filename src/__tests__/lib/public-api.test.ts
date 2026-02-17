import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  hasPermission,
  WEBHOOK_EVENTS,
  signPayload,
  verifySignature,
  checkRateLimit,
  createApiKey,
  getApiKeys,
  revokeApiKey,
  deleteApiKey,
  createWebhook,
  getWebhooks,
  updateWebhook,
  deleteWebhook,
  deliverWebhook,
  getWebhookDeliveries,
  dispatchWebhookEvent,
  logApiUsage,
  getApiUsageStats,
  validateApiKey,
} from '../../lib/public-api';
import type { ApiKey, Webhook, WebhookDelivery, WebhookEvent, RateLimitInfo, ApiKeyPermission } from '@/lib/types';

// ============================================================================
// Mock Supabase Helper
// ============================================================================

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chainable: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return {
    from: vi.fn(() => chainable),
    _chain: chainable,
  };
}

// ============================================================================
// generateApiKey
// ============================================================================

describe('Public API (P5.0)', () => {
  describe('generateApiKey', () => {
    it('returns a key that starts with "ab_"', () => {
      const { raw } = generateApiKey();
      expect(raw.startsWith('ab_')).toBe(true);
    });

    it('returns a key with total length of 43 (3 prefix + 40 random)', () => {
      const { raw } = generateApiKey();
      expect(raw.length).toBe(43);
    });

    it('returns a prefix that is the first 11 characters of the raw key', () => {
      const { raw, prefix } = generateApiKey();
      expect(prefix).toBe(raw.substring(0, 11));
    });

    it('generates different keys on each call', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1.raw).not.toBe(key2.raw);
    });

    it('only contains valid characters', () => {
      const { raw } = generateApiKey();
      const validChars = /^ab_[A-Za-z0-9]{40}$/;
      expect(raw).toMatch(validChars);
    });
  });

  // ============================================================================
  // hashApiKey
  // ============================================================================

  describe('hashApiKey', () => {
    it('returns a consistent hash for the same input', async () => {
      const hash1 = await hashApiKey('ab_testkey123');
      const hash2 = await hashApiKey('ab_testkey123');
      expect(hash1).toBe(hash2);
    });

    it('returns a 64-character hex string (SHA-256)', async () => {
      const hash = await hashApiKey('ab_testkey123');
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns different hashes for different inputs', async () => {
      const hash1 = await hashApiKey('ab_key1');
      const hash2 = await hashApiKey('ab_key2');
      expect(hash1).not.toBe(hash2);
    });
  });

  // ============================================================================
  // hasPermission
  // ============================================================================

  describe('hasPermission', () => {
    const mockKey: ApiKey = {
      id: 'key-1',
      name: 'Test Key',
      key_hash: 'hash',
      key_prefix: 'ab_test1234',
      user_id: 'user-1',
      permissions: ['cards:read', 'boards:read', 'comments:write'] as ApiKeyPermission[],
      rate_limit_per_minute: 60,
      rate_limit_per_day: 10000,
      is_active: true,
      last_used_at: null,
      expires_at: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    it('returns true when key has the required permission', () => {
      expect(hasPermission(mockKey, 'cards:read')).toBe(true);
    });

    it('returns false when key does not have the required permission', () => {
      expect(hasPermission(mockKey, 'cards:write')).toBe(false);
    });

    it('checks exact permission match', () => {
      expect(hasPermission(mockKey, 'boards:read')).toBe(true);
      expect(hasPermission(mockKey, 'boards:write')).toBe(false);
    });
  });

  // ============================================================================
  // WEBHOOK_EVENTS
  // ============================================================================

  describe('WEBHOOK_EVENTS', () => {
    it('contains all 12 expected events', () => {
      expect(WEBHOOK_EVENTS).toHaveLength(12);
    });

    it('includes card events', () => {
      const events = WEBHOOK_EVENTS.map((e) => e.event);
      expect(events).toContain('card.created');
      expect(events).toContain('card.updated');
      expect(events).toContain('card.moved');
      expect(events).toContain('card.deleted');
    });

    it('includes comment events', () => {
      const events = WEBHOOK_EVENTS.map((e) => e.event);
      expect(events).toContain('comment.added');
      expect(events).toContain('comment.deleted');
    });

    it('includes label events', () => {
      const events = WEBHOOK_EVENTS.map((e) => e.event);
      expect(events).toContain('label.added');
      expect(events).toContain('label.removed');
    });

    it('includes board events', () => {
      const events = WEBHOOK_EVENTS.map((e) => e.event);
      expect(events).toContain('board.created');
      expect(events).toContain('board.updated');
    });

    it('includes member events', () => {
      const events = WEBHOOK_EVENTS.map((e) => e.event);
      expect(events).toContain('member.added');
      expect(events).toContain('member.removed');
    });

    it('every event has a description', () => {
      for (const e of WEBHOOK_EVENTS) {
        expect(e.description).toBeTruthy();
        expect(typeof e.description).toBe('string');
      }
    });
  });

  // ============================================================================
  // signPayload & verifySignature
  // ============================================================================

  describe('signPayload', () => {
    it('produces consistent signatures for the same input', async () => {
      const sig1 = await signPayload('secret123', '{"event":"test"}');
      const sig2 = await signPayload('secret123', '{"event":"test"}');
      expect(sig1).toBe(sig2);
    });

    it('produces different signatures for different secrets', async () => {
      const sig1 = await signPayload('secret1', '{"event":"test"}');
      const sig2 = await signPayload('secret2', '{"event":"test"}');
      expect(sig1).not.toBe(sig2);
    });

    it('produces different signatures for different payloads', async () => {
      const sig1 = await signPayload('secret', 'payload1');
      const sig2 = await signPayload('secret', 'payload2');
      expect(sig1).not.toBe(sig2);
    });

    it('returns a hex string', async () => {
      const sig = await signPayload('secret', 'data');
      expect(sig).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('verifySignature', () => {
    it('returns true for matching signature', async () => {
      const secret = 'whsec_test';
      const payload = '{"event":"card.created"}';
      const sig = await signPayload(secret, payload);
      const valid = await verifySignature(secret, payload, sig);
      expect(valid).toBe(true);
    });

    it('returns false for non-matching signature', async () => {
      const valid = await verifySignature('secret', 'payload', 'invalid_signature');
      expect(valid).toBe(false);
    });

    it('returns false when secret is different', async () => {
      const sig = await signPayload('secret1', 'data');
      const valid = await verifySignature('secret2', 'data', sig);
      expect(valid).toBe(false);
    });
  });

  // ============================================================================
  // checkRateLimit (mock supabase)
  // ============================================================================

  describe('checkRateLimit', () => {
    it('returns allowed=true when under both limits', async () => {
      const mock = createMockSupabase({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({ count: 5 }),
          }),
        }),
      });

      // We need a more specific mock for the chained query
      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValueOnce({ count: 5 }).mockResolvedValueOnce({ count: 100 }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      const result = await checkRateLimit(supabase as any, 'key-1', 60, 10000);
      expect(result.allowed).toBe(true);
      expect(result.info.remaining).toBeGreaterThan(0);
    });

    it('returns allowed=false when over minute limit', async () => {
      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValueOnce({ count: 100 }).mockResolvedValueOnce({ count: 200 }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      const result = await checkRateLimit(supabase as any, 'key-1', 60, 10000);
      expect(result.allowed).toBe(false);
      expect(result.info.remaining).toBe(0);
    });

    it('returns rate limit info with reset timestamp', async () => {
      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      const result = await checkRateLimit(supabase as any, 'key-1', 60, 10000);
      expect(result.info).toHaveProperty('limit');
      expect(result.info).toHaveProperty('remaining');
      expect(result.info).toHaveProperty('reset_at');
      expect(new Date(result.info.reset_at).getTime()).toBeGreaterThan(Date.now());
    });
  });

  // ============================================================================
  // createApiKey (mock)
  // ============================================================================

  describe('createApiKey', () => {
    it('returns key and raw key on success', async () => {
      const mockApiKey = {
        id: 'key-1',
        name: 'Test',
        key_hash: 'hash',
        key_prefix: 'ab_test1234',
        user_id: 'user-1',
        permissions: ['cards:read'],
        rate_limit_per_minute: 60,
        rate_limit_per_day: 10000,
        is_active: true,
        last_used_at: null,
        expires_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mock = createMockSupabase({
        single: vi.fn().mockResolvedValue({ data: mockApiKey, error: null }),
      });

      const result = await createApiKey(mock as any, {
        name: 'Test',
        userId: 'user-1',
        permissions: ['cards:read'],
      });

      expect(result).not.toBeNull();
      expect(result!.apiKey.name).toBe('Test');
      expect(result!.rawKey).toBeTruthy();
      expect(result!.rawKey.startsWith('ab_')).toBe(true);
    });

    it('returns null on error', async () => {
      const mock = createMockSupabase({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
      });

      const result = await createApiKey(mock as any, {
        name: 'Test',
        userId: 'user-1',
        permissions: ['cards:read'],
      });

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // getApiKeys (mock)
  // ============================================================================

  describe('getApiKeys', () => {
    it('returns array of keys', async () => {
      const mockKeys = [
        { id: 'key-1', name: 'Key 1' },
        { id: 'key-2', name: 'Key 2' },
      ];

      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockKeys }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      const result = await getApiKeys(supabase as any, 'user-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Key 1');
    });

    it('returns empty array when no keys', async () => {
      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      const result = await getApiKeys(supabase as any, 'user-1');
      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // revokeApiKey (mock)
  // ============================================================================

  describe('revokeApiKey', () => {
    it('calls update with is_active false', async () => {
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });
      const supabase = {
        from: vi.fn(() => ({
          update: updateMock,
        })),
      };

      await revokeApiKey(supabase as any, 'key-1');

      expect(supabase.from).toHaveBeenCalledWith('api_keys');
      expect(updateMock).toHaveBeenCalledWith({ is_active: false });
    });
  });

  // ============================================================================
  // createWebhook (mock)
  // ============================================================================

  describe('createWebhook', () => {
    it('returns webhook with generated secret on success', async () => {
      const mockWebhook = {
        id: 'wh-1',
        user_id: 'user-1',
        url: 'https://example.com/webhook',
        secret: 'whsec_abc123',
        events: ['card.created'],
        is_active: true,
        description: null,
        failure_count: 0,
        last_triggered_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mock = createMockSupabase({
        single: vi.fn().mockResolvedValue({ data: mockWebhook, error: null }),
      });

      const result = await createWebhook(mock as any, {
        userId: 'user-1',
        url: 'https://example.com/webhook',
        events: ['card.created'] as WebhookEvent[],
      });

      expect(result).not.toBeNull();
      expect(result!.url).toBe('https://example.com/webhook');
      expect(result!.events).toContain('card.created');
    });

    it('returns null on error', async () => {
      const mock = createMockSupabase({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
      });

      const result = await createWebhook(mock as any, {
        userId: 'user-1',
        url: 'https://example.com/webhook',
        events: ['card.created'] as WebhookEvent[],
      });

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // getWebhooks (mock)
  // ============================================================================

  describe('getWebhooks', () => {
    it('returns array of webhooks', async () => {
      const mockWebhooks = [
        { id: 'wh-1', url: 'https://a.com' },
        { id: 'wh-2', url: 'https://b.com' },
      ];

      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockWebhooks }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      const result = await getWebhooks(supabase as any, 'user-1');
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });

  // ============================================================================
  // deliverWebhook (mock)
  // ============================================================================

  describe('deliverWebhook', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('logs delivery and updates webhook metadata on success', async () => {
      const mockDelivery = {
        id: 'del-1',
        webhook_id: 'wh-1',
        event_type: 'card.created',
        payload: {},
        response_status: 200,
        response_body: 'OK',
        response_time_ms: 50,
        attempt_number: 1,
        success: true,
        error_message: null,
        delivered_at: '2024-01-01T00:00:00Z',
      };

      // Mock global fetch for the webhook delivery
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      }));

      const chainable = {
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockDelivery }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      const webhook: Webhook = {
        id: 'wh-1',
        user_id: 'user-1',
        url: 'https://example.com/webhook',
        secret: 'whsec_test',
        events: ['card.created'],
        is_active: true,
        description: null,
        failure_count: 0,
        last_triggered_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const result = await deliverWebhook(supabase as any, webhook, 'card.created', { card_id: 'card-1' });
      expect(result).not.toBeNull();
      expect(supabase.from).toHaveBeenCalledWith('webhook_deliveries');
    });

    it('logs delivery with error on fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection refused')));

      const mockDelivery = {
        id: 'del-2',
        webhook_id: 'wh-1',
        success: false,
        error_message: 'Connection refused',
      };

      const chainable = {
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockDelivery }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      const webhook: Webhook = {
        id: 'wh-1',
        user_id: 'user-1',
        url: 'https://example.com/webhook',
        secret: 'whsec_test',
        events: ['card.created'],
        is_active: true,
        description: null,
        failure_count: 5,
        last_triggered_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const result = await deliverWebhook(supabase as any, webhook, 'card.created', {});
      expect(supabase.from).toHaveBeenCalledWith('webhook_deliveries');
    });
  });

  // ============================================================================
  // dispatchWebhookEvent (mock)
  // ============================================================================

  describe('dispatchWebhookEvent', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('dispatches to matching active webhooks only', async () => {
      const activeWebhook: Webhook = {
        id: 'wh-1',
        user_id: 'user-1',
        url: 'https://a.com/hook',
        secret: 'whsec_a',
        events: ['card.created', 'card.updated'],
        is_active: true,
        description: null,
        failure_count: 0,
        last_triggered_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const inactiveWebhook: Webhook = {
        id: 'wh-2',
        user_id: 'user-1',
        url: 'https://b.com/hook',
        secret: 'whsec_b',
        events: ['card.created'],
        is_active: false,
        description: null,
        failure_count: 0,
        last_triggered_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const nonMatchingWebhook: Webhook = {
        id: 'wh-3',
        user_id: 'user-1',
        url: 'https://c.com/hook',
        secret: 'whsec_c',
        events: ['board.created'],
        is_active: true,
        description: null,
        failure_count: 0,
        last_triggered_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const allWebhooks = [activeWebhook, inactiveWebhook, nonMatchingWebhook];
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('OK'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const deliveryData = {
        id: 'del-1',
        success: true,
      };

      const chainable = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: allWebhooks }),
        single: vi.fn().mockResolvedValue({ data: deliveryData }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      await dispatchWebhookEvent(supabase as any, 'user-1', 'card.created', { card_id: 'card-1' });

      // Only one webhook should match: activeWebhook (wh-1)
      // inactiveWebhook is inactive, nonMatchingWebhook doesn't subscribe to card.created
      // fetch should have been called once for the actual delivery
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://a.com/hook',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ============================================================================
  // Type shape tests
  // ============================================================================

  describe('Type shape tests', () => {
    it('ApiKey has required fields', () => {
      const key: ApiKey = {
        id: 'key-1',
        name: 'Test',
        key_hash: 'hash',
        key_prefix: 'ab_test1234',
        user_id: 'user-1',
        permissions: ['cards:read'],
        rate_limit_per_minute: 60,
        rate_limit_per_day: 10000,
        is_active: true,
        last_used_at: null,
        expires_at: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      expect(key).toHaveProperty('id');
      expect(key).toHaveProperty('name');
      expect(key).toHaveProperty('key_hash');
      expect(key).toHaveProperty('key_prefix');
      expect(key).toHaveProperty('user_id');
      expect(key).toHaveProperty('permissions');
      expect(key).toHaveProperty('rate_limit_per_minute');
      expect(key).toHaveProperty('rate_limit_per_day');
      expect(key).toHaveProperty('is_active');
      expect(key).toHaveProperty('last_used_at');
      expect(key).toHaveProperty('expires_at');
      expect(key).toHaveProperty('created_at');
      expect(key).toHaveProperty('updated_at');
    });

    it('Webhook has required fields', () => {
      const webhook: Webhook = {
        id: 'wh-1',
        user_id: 'user-1',
        url: 'https://example.com',
        secret: 'whsec_test',
        events: ['card.created'],
        is_active: true,
        description: null,
        failure_count: 0,
        last_triggered_at: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      expect(webhook).toHaveProperty('id');
      expect(webhook).toHaveProperty('user_id');
      expect(webhook).toHaveProperty('url');
      expect(webhook).toHaveProperty('secret');
      expect(webhook).toHaveProperty('events');
      expect(webhook).toHaveProperty('is_active');
      expect(webhook).toHaveProperty('description');
      expect(webhook).toHaveProperty('failure_count');
      expect(webhook).toHaveProperty('last_triggered_at');
      expect(webhook).toHaveProperty('created_at');
      expect(webhook).toHaveProperty('updated_at');
    });

    it('WebhookDelivery has required fields', () => {
      const delivery: WebhookDelivery = {
        id: 'del-1',
        webhook_id: 'wh-1',
        event_type: 'card.created',
        payload: { card_id: 'card-1' },
        response_status: 200,
        response_body: 'OK',
        response_time_ms: 50,
        attempt_number: 1,
        success: true,
        error_message: null,
        delivered_at: '2024-01-01',
      };

      expect(delivery).toHaveProperty('id');
      expect(delivery).toHaveProperty('webhook_id');
      expect(delivery).toHaveProperty('event_type');
      expect(delivery).toHaveProperty('payload');
      expect(delivery).toHaveProperty('response_status');
      expect(delivery).toHaveProperty('response_body');
      expect(delivery).toHaveProperty('response_time_ms');
      expect(delivery).toHaveProperty('attempt_number');
      expect(delivery).toHaveProperty('success');
      expect(delivery).toHaveProperty('error_message');
      expect(delivery).toHaveProperty('delivered_at');
    });

    it('RateLimitInfo has required fields', () => {
      const info: RateLimitInfo = {
        limit: 60,
        remaining: 55,
        reset_at: '2024-01-01T00:01:00Z',
      };

      expect(info).toHaveProperty('limit');
      expect(info).toHaveProperty('remaining');
      expect(info).toHaveProperty('reset_at');
    });
  });

  // ============================================================================
  // logApiUsage (mock)
  // ============================================================================

  describe('logApiUsage', () => {
    it('inserts a usage log entry', async () => {
      const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
      const supabase = {
        from: vi.fn(() => ({
          insert: insertMock,
        })),
      };

      await logApiUsage(supabase as any, {
        apiKeyId: 'key-1',
        endpoint: '/api/v1/cards',
        method: 'GET',
        statusCode: 200,
        responseTimeMs: 45,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(supabase.from).toHaveBeenCalledWith('api_usage_log');
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          api_key_id: 'key-1',
          endpoint: '/api/v1/cards',
          method: 'GET',
          status_code: 200,
        })
      );
    });
  });

  // ============================================================================
  // getApiUsageStats (mock)
  // ============================================================================

  describe('getApiUsageStats', () => {
    it('returns usage entries for specified days', async () => {
      const mockEntries = [
        { id: 'u-1', endpoint: '/api/v1/cards', method: 'GET', status_code: 200, created_at: '2024-01-01T00:00:00Z' },
        { id: 'u-2', endpoint: '/api/v1/cards', method: 'POST', status_code: 201, created_at: '2024-01-01T01:00:00Z' },
      ];

      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockEntries }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      const result = await getApiUsageStats(supabase as any, 'key-1', 7);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });

  // ============================================================================
  // getWebhookDeliveries (mock)
  // ============================================================================

  describe('getWebhookDeliveries', () => {
    it('returns delivery entries', async () => {
      const mockDeliveries = [
        { id: 'del-1', event_type: 'card.created', success: true },
        { id: 'del-2', event_type: 'card.updated', success: false },
      ];

      const chainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockDeliveries }),
      };
      const supabase = { from: vi.fn(() => chainable) };

      const result = await getWebhookDeliveries(supabase as any, 'wh-1', 50);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(false);
    });
  });

  // ============================================================================
  // deleteApiKey (mock)
  // ============================================================================

  describe('deleteApiKey', () => {
    it('calls delete on api_keys table', async () => {
      const deleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });
      const supabase = {
        from: vi.fn(() => ({
          delete: deleteMock,
        })),
      };

      await deleteApiKey(supabase as any, 'key-1');
      expect(supabase.from).toHaveBeenCalledWith('api_keys');
      expect(deleteMock).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // updateWebhook (mock)
  // ============================================================================

  describe('updateWebhook', () => {
    it('returns updated webhook on success', async () => {
      const mockUpdated = {
        id: 'wh-1',
        url: 'https://new-url.com/hook',
        is_active: false,
      };

      const mock = createMockSupabase({
        single: vi.fn().mockResolvedValue({ data: mockUpdated, error: null }),
      });

      const result = await updateWebhook(mock as any, 'wh-1', {
        url: 'https://new-url.com/hook',
        is_active: false,
      });

      expect(result).not.toBeNull();
      expect(result!.url).toBe('https://new-url.com/hook');
    });

    it('returns null on error', async () => {
      const mock = createMockSupabase({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      });

      const result = await updateWebhook(mock as any, 'wh-999', { url: 'https://test.com' });
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // deleteWebhook (mock)
  // ============================================================================

  describe('deleteWebhook', () => {
    it('calls delete on webhooks table', async () => {
      const deleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });
      const supabase = {
        from: vi.fn(() => ({
          delete: deleteMock,
        })),
      };

      await deleteWebhook(supabase as any, 'wh-1');
      expect(supabase.from).toHaveBeenCalledWith('webhooks');
      expect(deleteMock).toHaveBeenCalled();
    });
  });
});
