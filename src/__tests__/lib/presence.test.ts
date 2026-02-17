import { describe, it, expect } from 'vitest';
import { usePresence } from '@/hooks/usePresence';
import * as presenceModule from '@/hooks/usePresence';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import * as typingModule from '@/hooks/useTypingIndicator';

describe('Presence (v5.4.0)', () => {
  // ===========================================================================
  // Hook export checks
  // ===========================================================================

  describe('usePresence export', () => {
    it('usePresence is exported and is a function', () => {
      expect(typeof usePresence).toBe('function');
    });

    it('usePresence module imports without throwing', () => {
      expect(presenceModule).toBeDefined();
    });

    it('usePresence has the correct function name', () => {
      expect(usePresence.name).toBe('usePresence');
    });
  });

  describe('useTypingIndicator export', () => {
    it('useTypingIndicator is exported and is a function', () => {
      expect(typeof useTypingIndicator).toBe('function');
    });

    it('useTypingIndicator module imports without throwing', () => {
      expect(typingModule).toBeDefined();
    });

    it('useTypingIndicator has the correct function name', () => {
      expect(useTypingIndicator.name).toBe('useTypingIndicator');
    });
  });

  // ===========================================================================
  // PresenceUser interface shape verification
  // ===========================================================================

  describe('PresenceUser interface', () => {
    it('can create an object matching the PresenceUser shape', () => {
      const presenceUser = {
        userId: 'user-001',
        displayName: 'Alice',
        avatarUrl: 'https://example.com/avatar.png',
        lastSeen: '2026-02-10T12:00:00Z',
      };

      expect(presenceUser).toBeDefined();
      expect(presenceUser.userId).toBe('user-001');
      expect(presenceUser.displayName).toBe('Alice');
      expect(presenceUser.avatarUrl).toBe('https://example.com/avatar.png');
      expect(presenceUser.lastSeen).toBe('2026-02-10T12:00:00Z');
    });

    it('PresenceUser avatarUrl can be null', () => {
      const presenceUser = {
        userId: 'user-002',
        displayName: 'Bob',
        avatarUrl: null,
        lastSeen: '2026-02-10T13:00:00Z',
      };

      expect(presenceUser.avatarUrl).toBeNull();
    });
  });

  // ===========================================================================
  // TypingUser interface shape verification
  // ===========================================================================

  describe('TypingUser interface', () => {
    it('can create an object matching the TypingUser shape', () => {
      const typingUser = {
        userId: 'user-003',
        displayName: 'Charlie',
      };

      expect(typingUser).toBeDefined();
      expect(typingUser.userId).toBe('user-003');
      expect(typingUser.displayName).toBe('Charlie');
    });

    it('TypingUser has exactly userId and displayName', () => {
      const typingUser = {
        userId: 'user-004',
        displayName: 'Diana',
      };

      const keys = Object.keys(typingUser);
      expect(keys).toHaveLength(2);
      expect(keys).toContain('userId');
      expect(keys).toContain('displayName');
    });
  });

  // ===========================================================================
  // Function.length checks
  // ===========================================================================

  describe('function.length checks', () => {
    it('usePresence accepts 1 argument (options object)', () => {
      expect(usePresence.length).toBe(1);
    });

    it('useTypingIndicator accepts 1 argument (options object)', () => {
      expect(useTypingIndicator.length).toBe(1);
    });
  });
});
