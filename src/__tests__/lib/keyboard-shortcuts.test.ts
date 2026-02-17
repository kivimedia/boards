import { describe, it, expect } from 'vitest';
import {
  SHORTCUTS,
  matchesShortcut,
  formatShortcut,
  getShortcutsByCategory,
} from '@/lib/keyboard-shortcuts';

describe('Keyboard Shortcuts (v5.5.0)', () => {
  describe('SHORTCUTS', () => {
    it('is a non-empty object', () => {
      expect(typeof SHORTCUTS).toBe('object');
      expect(Object.keys(SHORTCUTS).length).toBeGreaterThan(0);
    });

    it('contains open-search shortcut', () => {
      expect(SHORTCUTS['open-search']).toBeDefined();
      expect(SHORTCUTS['open-search'].key).toBe('k');
    });

    it('contains show-help shortcut', () => {
      expect(SHORTCUTS['show-help']).toBeDefined();
      expect(SHORTCUTS['show-help'].key).toBe('?');
    });

    it('contains escape shortcut', () => {
      expect(SHORTCUTS['escape']).toBeDefined();
      expect(SHORTCUTS['escape'].key).toBe('Escape');
    });

    it('each shortcut has required fields', () => {
      for (const [key, shortcut] of Object.entries(SHORTCUTS)) {
        expect(shortcut).toHaveProperty('key');
        expect(shortcut).toHaveProperty('description');
        expect(shortcut).toHaveProperty('category');
        expect(typeof shortcut.key).toBe('string');
        expect(typeof shortcut.description).toBe('string');
        expect(typeof shortcut.category).toBe('string');
      }
    });
  });

  describe('matchesShortcut', () => {
    it('is a function', () => {
      expect(typeof matchesShortcut).toBe('function');
    });

    it('matches simple key shortcut', () => {
      const event = new KeyboardEvent('keydown', { key: '?' });
      expect(matchesShortcut(event, SHORTCUTS['show-help'])).toBe(true);
    });

    it('does not match wrong key', () => {
      const event = new KeyboardEvent('keydown', { key: 'a' });
      expect(matchesShortcut(event, SHORTCUTS['show-help'])).toBe(false);
    });
  });

  describe('formatShortcut', () => {
    it('is a function', () => {
      expect(typeof formatShortcut).toBe('function');
    });

    it('formats shortcut with meta modifier', () => {
      const result = formatShortcut(SHORTCUTS['open-search']);
      expect(result).toContain('⌘');
      expect(result).toContain('K');
    });

    it('formats shortcut without modifiers', () => {
      const result = formatShortcut(SHORTCUTS['show-help']);
      expect(result).toContain('?');
    });
  });

  describe('getShortcutsByCategory', () => {
    it('is a function', () => {
      expect(typeof getShortcutsByCategory).toBe('function');
    });

    it('returns an object grouped by category', () => {
      const categories = getShortcutsByCategory();
      expect(typeof categories).toBe('object');
      expect(Object.keys(categories).length).toBeGreaterThan(0);
    });

    it('contains Navigation category', () => {
      const categories = getShortcutsByCategory();
      expect(categories['Navigation']).toBeDefined();
      expect(Array.isArray(categories['Navigation'])).toBe(true);
    });

    it('all values are arrays of shortcuts', () => {
      const categories = getShortcutsByCategory();
      for (const shortcuts of Object.values(categories)) {
        expect(Array.isArray(shortcuts)).toBe(true);
        for (const s of shortcuts) {
          expect(s).toHaveProperty('key');
          expect(s).toHaveProperty('description');
        }
      }
    });
  });
});
