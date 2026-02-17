import { describe, it, expect } from 'vitest';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { resolveConflict } from '@/lib/conflict-resolution';

describe('Typing Indicator & Merge Edge Cases (v5.4.0)', () => {
  // ===========================================================================
  // useTypingIndicator hook export
  // ===========================================================================

  describe('useTypingIndicator export', () => {
    it('useTypingIndicator is a function', () => {
      expect(typeof useTypingIndicator).toBe('function');
    });

    it('useTypingIndicator has the correct name', () => {
      expect(useTypingIndicator.name).toBe('useTypingIndicator');
    });

    it('useTypingIndicator accepts 1 argument', () => {
      expect(useTypingIndicator.length).toBe(1);
    });
  });

  // ===========================================================================
  // resolveConflict merge edge cases
  // ===========================================================================

  describe('resolveConflict merge edge cases', () => {
    it('merge with null values in local does not overwrite server values', () => {
      const localData = { title: null, description: 'local desc' };
      const serverData = { title: 'Server Title', description: 'server desc' };

      const result = resolveConflict(
        localData as Record<string, unknown>,
        serverData as Record<string, unknown>,
        'merge'
      );

      // null in local should NOT overwrite server (the merge logic skips null/undefined)
      expect(result.title).toBe('Server Title');
      // description differs and is non-null, so local wins
      expect(result.description).toBe('local desc');
    });

    it('merge with null values in server: local non-null values overwrite', () => {
      const localData = { title: 'Local Title', description: 'local desc' };
      const serverData = { title: null, description: 'server desc' };

      const result = resolveConflict(
        localData as Record<string, unknown>,
        serverData as Record<string, unknown>,
        'merge'
      );

      // local title is non-null and different from server's null, so local wins
      expect(result.title).toBe('Local Title');
      // description differs, local wins
      expect(result.description).toBe('local desc');
    });

    it('merge with nested objects (shallow merge - local top-level fields win)', () => {
      const localData = {
        title: 'Local',
        metadata: { color: 'red', size: 'large' },
      };
      const serverData = {
        title: 'Server',
        metadata: { color: 'blue', weight: 'heavy' },
      };

      const result = resolveConflict(localData, serverData, 'merge');

      // title: local wins because it differs
      expect(result.title).toBe('Local');
      // metadata: shallow merge means local's entire metadata object wins (not deep merged)
      expect(result.metadata).toEqual({ color: 'red', size: 'large' });
    });

    it('merge with arrays: local wins for array fields', () => {
      const localData = {
        title: 'Same',
        labels: ['urgent', 'design'],
      };
      const serverData = {
        title: 'Same',
        labels: ['review', 'backend'],
      };

      const result = resolveConflict(localData, serverData, 'merge');

      // title same in both, stays as is
      expect(result.title).toBe('Same');
      // labels differ, local wins
      expect(result.labels).toEqual(['urgent', 'design']);
    });

    it('merge preserves all keys from both objects', () => {
      const localData = {
        title: 'Local Title',
        localOnly: 'local-value',
      };
      const serverData = {
        title: 'Server Title',
        serverOnly: 'server-value',
        anotherServerField: 42,
      };

      const result = resolveConflict(localData, serverData, 'merge');

      // All keys from both should be present
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('localOnly');
      expect(result).toHaveProperty('serverOnly');
      expect(result).toHaveProperty('anotherServerField');

      // title: local wins (differs)
      expect(result.title).toBe('Local Title');
      // localOnly: only in local, gets added
      expect(result.localOnly).toBe('local-value');
      // serverOnly: only in server, stays from spread
      expect(result.serverOnly).toBe('server-value');
      // anotherServerField: only in server, stays from spread
      expect(result.anotherServerField).toBe(42);
    });

    it('merge with undefined values in local does not overwrite server values', () => {
      const localData: Record<string, unknown> = { title: undefined, status: 'done' };
      const serverData = { title: 'Server Title', status: 'in_progress' };

      const result = resolveConflict(localData, serverData, 'merge');

      // undefined in local should NOT overwrite server
      expect(result.title).toBe('Server Title');
      // status differs and is non-null/non-undefined, local wins
      expect(result.status).toBe('done');
    });

    it('merge where all local values match server returns server-equivalent object', () => {
      const localData = { title: 'Same', description: 'Same' };
      const serverData = { title: 'Same', description: 'Same' };

      const result = resolveConflict(localData, serverData, 'merge');

      // No differences, so merged is just a copy of server
      expect(result).toEqual({ title: 'Same', description: 'Same' });
    });
  });
});
