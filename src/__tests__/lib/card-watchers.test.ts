import { describe, it, expect } from 'vitest';
import {
  getWatchers,
  addWatcher,
  removeWatcher,
  isWatching,
  notifyWatchers,
} from '@/lib/card-watchers';
import * as cardWatchersModule from '@/lib/card-watchers';

describe('Card Watchers (v5.2.0)', () => {
  // ===========================================================================
  // Export existence checks
  // ===========================================================================

  describe('exports', () => {
    it('getWatchers is a function', () => {
      expect(typeof getWatchers).toBe('function');
    });

    it('addWatcher is a function', () => {
      expect(typeof addWatcher).toBe('function');
    });

    it('removeWatcher is a function', () => {
      expect(typeof removeWatcher).toBe('function');
    });

    it('isWatching is a function', () => {
      expect(typeof isWatching).toBe('function');
    });

    it('notifyWatchers is a function', () => {
      expect(typeof notifyWatchers).toBe('function');
    });

    it('exports exactly 5 functions', () => {
      const exportKeys = Object.keys(cardWatchersModule);
      expect(exportKeys).toHaveLength(5);
      expect(exportKeys).toContain('getWatchers');
      expect(exportKeys).toContain('addWatcher');
      expect(exportKeys).toContain('removeWatcher');
      expect(exportKeys).toContain('isWatching');
      expect(exportKeys).toContain('notifyWatchers');
    });

    it('all exports are functions', () => {
      for (const key of Object.keys(cardWatchersModule)) {
        expect(typeof (cardWatchersModule as Record<string, unknown>)[key]).toBe('function');
      }
    });
  });

  // ===========================================================================
  // Function arity checks (function.length)
  // ===========================================================================

  describe('function arity', () => {
    it('getWatchers requires 2 arguments', () => {
      expect(getWatchers.length).toBe(2);
    });

    it('addWatcher requires 3 arguments', () => {
      expect(addWatcher.length).toBe(3);
    });

    it('removeWatcher requires 3 arguments', () => {
      expect(removeWatcher.length).toBe(3);
    });

    it('isWatching requires 3 arguments', () => {
      expect(isWatching.length).toBe(3);
    });

    it('notifyWatchers requires at least 4 arguments (some optional)', () => {
      expect(notifyWatchers.length).toBeGreaterThanOrEqual(4);
    });
  });
});
