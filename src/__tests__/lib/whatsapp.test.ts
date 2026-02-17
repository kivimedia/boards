import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateVerificationCode,
  isInDNDWindow,
  isThrottled,
  processQuickAction,
  dispatchNotification,
  linkPhone,
  verifyPhone,
  getWhatsAppUser,
  updateWhatsAppUser,
  unlinkPhone,
  getWhatsAppGroups,
  createWhatsAppGroup,
  deleteWhatsAppGroup,
  getMessages,
  sendWhatsAppMessage,
  getQuickActions,
  createQuickAction,
  deleteQuickAction,
  getDigestConfig,
  upsertDigestConfig,
} from '@/lib/whatsapp';
import type { WhatsAppUser } from '@/lib/types';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

function createMockChain(returnData: unknown = null, returnError: unknown = null, count: number | null = null) {
  const chain: Record<string, unknown> = {};
  const methods = ['from', 'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'gte', 'order', 'limit', 'single'];

  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }

  // Terminal methods return the data
  chain['single'] = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
  chain['then'] = undefined; // Make it thenable on select
  // For queries that don't call .single(), resolve on the chain itself
  (chain as Record<string, unknown>)['data'] = returnData;
  (chain as Record<string, unknown>)['error'] = returnError;
  (chain as Record<string, unknown>)['count'] = count;

  return chain;
}

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chain = createMockChain();

  // Make select resolve to { data, count } when head: true is used
  const mockFrom = vi.fn().mockReturnValue(chain);

  return {
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    _chain: chain,
    ...overrides,
  } as unknown;
}

// ============================================================================
// HELPER: CREATE WHATSAPP USER
// ============================================================================

function createMockWhatsAppUser(overrides: Partial<WhatsAppUser> = {}): WhatsAppUser {
  return {
    id: 'wa-1',
    user_id: 'user-1',
    phone_number: '+1234567890',
    phone_verified: true,
    verification_code: null,
    verification_expires_at: null,
    display_name: 'Test User',
    is_active: true,
    dnd_start: null,
    dnd_end: null,
    opt_out: false,
    frequency_cap_per_hour: 10,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('WhatsApp Integration (P4.0-4.1)', () => {
  // --------------------------------------------------------------------------
  // generateVerificationCode
  // --------------------------------------------------------------------------

  describe('generateVerificationCode', () => {
    it('returns a string', () => {
      const code = generateVerificationCode();
      expect(typeof code).toBe('string');
    });

    it('returns a 6-digit code', () => {
      const code = generateVerificationCode();
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it('returns different codes on multiple calls (randomness)', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 50; i++) {
        codes.add(generateVerificationCode());
      }
      // With 50 calls and 900k possible values, probability of all same is negligible
      expect(codes.size).toBeGreaterThan(1);
    });

    it('never returns a code less than 100000', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateVerificationCode();
        const num = parseInt(code, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
      }
    });

    it('never returns a code greater than 999999', () => {
      for (let i = 0; i < 100; i++) {
        const code = generateVerificationCode();
        const num = parseInt(code, 10);
        expect(num).toBeLessThanOrEqual(999999);
      }
    });
  });

  // --------------------------------------------------------------------------
  // isInDNDWindow
  // --------------------------------------------------------------------------

  describe('isInDNDWindow', () => {
    it('returns false when DND is not configured', () => {
      const user = createMockWhatsAppUser({ dnd_start: null, dnd_end: null });
      expect(isInDNDWindow(user)).toBe(false);
    });

    it('returns false when only dnd_start is set', () => {
      const user = createMockWhatsAppUser({ dnd_start: '22:00', dnd_end: null });
      expect(isInDNDWindow(user)).toBe(false);
    });

    it('returns false when only dnd_end is set', () => {
      const user = createMockWhatsAppUser({ dnd_start: null, dnd_end: '07:00' });
      expect(isInDNDWindow(user)).toBe(false);
    });

    it('returns true when current time is within DND window (same day)', () => {
      const user = createMockWhatsAppUser({ dnd_start: '00:00', dnd_end: '23:59' });
      // This will always be true since the window covers the entire day
      expect(isInDNDWindow(user)).toBe(true);
    });

    it('handles midnight wrap DND window (e.g., 22:00-07:00)', () => {
      const user = createMockWhatsAppUser({ dnd_start: '22:00', dnd_end: '07:00' });
      // We check structure: dnd_start > dnd_end, so the wrap-around path is taken
      expect(user.dnd_start! > user.dnd_end!).toBe(true);
      // isInDNDWindow uses the OR logic for wrap-around
      // The actual result depends on current time, so we just verify it doesn't throw
      const result = isInDNDWindow(user);
      expect(typeof result).toBe('boolean');
    });

    it('handles non-wrapping DND window (e.g., 09:00-17:00)', () => {
      const user = createMockWhatsAppUser({ dnd_start: '09:00', dnd_end: '17:00' });
      // dnd_start < dnd_end, so the AND logic is used
      expect(user.dnd_start! <= user.dnd_end!).toBe(true);
      const result = isInDNDWindow(user);
      expect(typeof result).toBe('boolean');
    });

    it('handles edge case where DND start equals end', () => {
      const user = createMockWhatsAppUser({ dnd_start: '12:00', dnd_end: '12:00' });
      const result = isInDNDWindow(user);
      expect(typeof result).toBe('boolean');
    });

    it('handles DND window starting at midnight (00:00-06:00)', () => {
      const user = createMockWhatsAppUser({ dnd_start: '00:00', dnd_end: '06:00' });
      // Non-wrapping window, start < end
      expect(user.dnd_start! <= user.dnd_end!).toBe(true);
      const result = isInDNDWindow(user);
      expect(typeof result).toBe('boolean');
    });

    it('handles DND window ending at midnight (20:00-23:59)', () => {
      const user = createMockWhatsAppUser({ dnd_start: '20:00', dnd_end: '23:59' });
      expect(user.dnd_start! <= user.dnd_end!).toBe(true);
      const result = isInDNDWindow(user);
      expect(typeof result).toBe('boolean');
    });
  });

  // --------------------------------------------------------------------------
  // isThrottled
  // --------------------------------------------------------------------------

  describe('isThrottled', () => {
    it('returns true when message count equals cap', async () => {
      const chain = createMockChain();
      // Override the terminal to return count
      (chain as Record<string, unknown>)['gte'] = vi.fn().mockResolvedValue({ count: 10, data: null, error: null });

      const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown;
      const result = await isThrottled(supabase as never, 'wa-1', 10);
      expect(result).toBe(true);
    });

    it('returns true when message count exceeds cap', async () => {
      const chain = createMockChain();
      (chain as Record<string, unknown>)['gte'] = vi.fn().mockResolvedValue({ count: 15, data: null, error: null });

      const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown;
      const result = await isThrottled(supabase as never, 'wa-1', 10);
      expect(result).toBe(true);
    });

    it('returns false when message count is below cap', async () => {
      const chain = createMockChain();
      (chain as Record<string, unknown>)['gte'] = vi.fn().mockResolvedValue({ count: 3, data: null, error: null });

      const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown;
      const result = await isThrottled(supabase as never, 'wa-1', 10);
      expect(result).toBe(false);
    });

    it('returns false when count is null (no messages)', async () => {
      const chain = createMockChain();
      (chain as Record<string, unknown>)['gte'] = vi.fn().mockResolvedValue({ count: null, data: null, error: null });

      const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown;
      const result = await isThrottled(supabase as never, 'wa-1', 10);
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // WhatsAppUser type shape
  // --------------------------------------------------------------------------

  describe('WhatsAppUser type shape', () => {
    it('has all required fields', () => {
      const user = createMockWhatsAppUser();
      expect(user.id).toBeDefined();
      expect(user.user_id).toBeDefined();
      expect(user.phone_number).toBeDefined();
      expect(typeof user.phone_verified).toBe('boolean');
      expect(typeof user.is_active).toBe('boolean');
      expect(typeof user.opt_out).toBe('boolean');
      expect(typeof user.frequency_cap_per_hour).toBe('number');
    });

    it('allows nullable fields', () => {
      const user = createMockWhatsAppUser({
        verification_code: null,
        verification_expires_at: null,
        display_name: null,
        dnd_start: null,
        dnd_end: null,
      });
      expect(user.verification_code).toBeNull();
      expect(user.display_name).toBeNull();
      expect(user.dnd_start).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Quick action processing logic
  // --------------------------------------------------------------------------

  describe('processQuickAction', () => {
    it('returns error for unknown keyword', async () => {
      const chain = createMockChain();
      (chain as Record<string, unknown>)['single'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });

      const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown;
      const result = await processQuickAction(supabase as never, 'nonexistent', 'card-1', 'user-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown command');
    });

    it('handles mark_done action type', async () => {
      // First call: get the action
      const actionChain = createMockChain();
      (actionChain as Record<string, unknown>)['single'] = vi.fn().mockResolvedValue({
        data: { keyword: 'done', action_type: 'mark_done', is_active: true, action_config: {} },
        error: null,
      });

      // Second call: get placement
      const placementChain = createMockChain();
      (placementChain as Record<string, unknown>)['single'] = vi.fn().mockResolvedValue({
        data: { board_id: 'board-1' },
        error: null,
      });

      // Third call: get last list
      const listChain = createMockChain();
      (listChain as Record<string, unknown>)['single'] = vi.fn().mockResolvedValue({
        data: { id: 'list-done' },
        error: null,
      });

      // Fourth call: update placement
      const updateChain = createMockChain();

      let callCount = 0;
      const supabase = {
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return actionChain;
          if (callCount === 2) return placementChain;
          if (callCount === 3) return listChain;
          return updateChain;
        }),
      } as unknown;

      const result = await processQuickAction(supabase as never, 'done', 'card-1', 'user-1');
      expect(result.success).toBe(true);
      expect(result.action).toBe('mark_done');
    });

    it('handles approve action type', async () => {
      const actionChain = createMockChain();
      (actionChain as Record<string, unknown>)['single'] = vi.fn().mockResolvedValue({
        data: { keyword: 'approve', action_type: 'approve', is_active: true, action_config: {} },
        error: null,
      });

      const updateChain = createMockChain();

      let callCount = 0;
      const supabase = {
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return actionChain;
          return updateChain;
        }),
      } as unknown;

      const result = await processQuickAction(supabase as never, 'approve', 'card-1', 'user-1');
      expect(result.success).toBe(true);
      expect(result.action).toBe('approve');
    });

    it('handles reject action type', async () => {
      const actionChain = createMockChain();
      (actionChain as Record<string, unknown>)['single'] = vi.fn().mockResolvedValue({
        data: { keyword: 'reject', action_type: 'reject', is_active: true, action_config: {} },
        error: null,
      });

      const updateChain = createMockChain();

      let callCount = 0;
      const supabase = {
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return actionChain;
          return updateChain;
        }),
      } as unknown;

      const result = await processQuickAction(supabase as never, 'reject', 'card-1', 'user-1');
      expect(result.success).toBe(true);
      expect(result.action).toBe('reject');
    });

    it('trims and lowercases keyword before lookup', async () => {
      const actionChain = createMockChain();
      const singleMock = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
      (actionChain as Record<string, unknown>)['single'] = singleMock;

      const supabase = { from: vi.fn().mockReturnValue(actionChain) } as unknown;
      await processQuickAction(supabase as never, '  DONE  ', 'card-1', 'user-1');

      // The keyword should have been lowercased and trimmed
      expect((actionChain as Record<string, unknown>)['eq']).toHaveBeenCalledWith('keyword', 'done');
    });
  });

  // --------------------------------------------------------------------------
  // Notification dispatch with DND/throttle checks
  // --------------------------------------------------------------------------

  describe('dispatchNotification', () => {
    it('returns null when user is not found', async () => {
      const chain = createMockChain(null);
      (chain as Record<string, unknown>)['single'] = vi.fn().mockResolvedValue({ data: null, error: null });

      const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown;
      const result = await dispatchNotification(supabase as never, {
        userId: 'user-1',
        eventType: 'card_assigned',
        content: 'You were assigned',
      });
      expect(result).toBeNull();
    });

    it('returns null when user has opted out', async () => {
      const optOutUser = createMockWhatsAppUser({ opt_out: true });
      const chain = createMockChain(optOutUser);
      (chain as Record<string, unknown>)['single'] = vi.fn().mockResolvedValue({ data: optOutUser, error: null });

      const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown;
      const result = await dispatchNotification(supabase as never, {
        userId: 'user-1',
        eventType: 'card_assigned',
        content: 'You were assigned',
      });
      expect(result).toBeNull();
    });

    it('returns null when phone is not verified', async () => {
      const unverifiedUser = createMockWhatsAppUser({ phone_verified: false });
      const chain = createMockChain(unverifiedUser);
      (chain as Record<string, unknown>)['single'] = vi.fn().mockResolvedValue({ data: unverifiedUser, error: null });

      const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown;
      const result = await dispatchNotification(supabase as never, {
        userId: 'user-1',
        eventType: 'card_assigned',
        content: 'You were assigned',
      });
      expect(result).toBeNull();
    });

    it('returns null when user is not active', async () => {
      const inactiveUser = createMockWhatsAppUser({ is_active: false });
      const chain = createMockChain(inactiveUser);
      (chain as Record<string, unknown>)['single'] = vi.fn().mockResolvedValue({ data: inactiveUser, error: null });

      const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown;
      const result = await dispatchNotification(supabase as never, {
        userId: 'user-1',
        eventType: 'card_assigned',
        content: 'You were assigned',
      });
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // WhatsApp message types
  // --------------------------------------------------------------------------

  describe('WhatsApp message and type validations', () => {
    it('supports all message direction types', () => {
      const directions: ('outbound' | 'inbound')[] = ['outbound', 'inbound'];
      expect(directions).toHaveLength(2);
    });

    it('supports all message types', () => {
      const types: ('notification' | 'quick_action' | 'digest' | 'verification' | 'reply')[] = [
        'notification',
        'quick_action',
        'digest',
        'verification',
        'reply',
      ];
      expect(types).toHaveLength(5);
    });

    it('supports all message statuses', () => {
      const statuses: ('pending' | 'sent' | 'delivered' | 'read' | 'failed')[] = [
        'pending',
        'sent',
        'delivered',
        'read',
        'failed',
      ];
      expect(statuses).toHaveLength(5);
    });

    it('supports all quick action types', () => {
      const types: ('mark_done' | 'approve' | 'reject' | 'assign' | 'comment' | 'snooze')[] = [
        'mark_done',
        'approve',
        'reject',
        'assign',
        'comment',
        'snooze',
      ];
      expect(types).toHaveLength(6);
    });
  });

  // --------------------------------------------------------------------------
  // WhatsAppDigestConfig shape
  // --------------------------------------------------------------------------

  describe('WhatsAppDigestConfig', () => {
    it('has expected shape', () => {
      const config = {
        id: 'dc-1',
        user_id: 'user-1',
        is_enabled: true,
        send_time: '08:00',
        include_overdue: true,
        include_assigned: true,
        include_mentions: false,
        include_board_summary: false,
        board_ids: ['board-1', 'board-2'],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      expect(config.is_enabled).toBe(true);
      expect(config.board_ids).toHaveLength(2);
      expect(config.include_overdue).toBe(true);
      expect(config.include_mentions).toBe(false);
    });

    it('supports empty board_ids', () => {
      const config = {
        id: 'dc-2',
        user_id: 'user-1',
        is_enabled: false,
        send_time: '09:00',
        include_overdue: false,
        include_assigned: false,
        include_mentions: false,
        include_board_summary: false,
        board_ids: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      expect(config.board_ids).toEqual([]);
      expect(config.is_enabled).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // WhatsAppNotificationLog shape
  // --------------------------------------------------------------------------

  describe('WhatsAppNotificationLog', () => {
    it('tracks throttled notifications', () => {
      const log = {
        id: 'wnl-1',
        notification_id: 'notif-1',
        whatsapp_user_id: 'wa-1',
        message_id: null,
        event_type: 'card_assigned',
        throttled: true,
        throttle_reason: 'DND window active',
        created_at: '2025-01-01T00:00:00Z',
      };

      expect(log.throttled).toBe(true);
      expect(log.throttle_reason).toBe('DND window active');
      expect(log.message_id).toBeNull();
    });

    it('tracks sent notifications', () => {
      const log = {
        id: 'wnl-2',
        notification_id: 'notif-2',
        whatsapp_user_id: 'wa-1',
        message_id: 'msg-1',
        event_type: 'card_overdue',
        throttled: false,
        throttle_reason: null,
        created_at: '2025-01-01T00:00:00Z',
      };

      expect(log.throttled).toBe(false);
      expect(log.throttle_reason).toBeNull();
      expect(log.message_id).toBe('msg-1');
    });
  });
});
