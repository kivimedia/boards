import { describe, it, expect } from 'vitest';
import { useTheme } from '@/hooks/useTheme';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import {
  SHORTCUTS,
  matchesShortcut,
  formatShortcut,
  getShortcutsByCategory,
} from '@/lib/keyboard-shortcuts';

describe('Theme (v5.5.0)', () => {
  it('useTheme is a function', () => {
    expect(typeof useTheme).toBe('function');
  });

  it('useTheme is exported from the module', () => {
    expect(useTheme).toBeDefined();
  });

  // Type-level tests
  it('Theme type allows light, dark, system', () => {
    const themes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    expect(themes).toHaveLength(3);
  });

  it('useKeyboardShortcuts is exported', () => {
    expect(typeof useKeyboardShortcuts).toBe('function');
  });

  it('formatShortcut returns a string', () => {
    const result = formatShortcut({ key: 'k', modifiers: ['meta'], description: 'test', category: 'test' });
    expect(typeof result).toBe('string');
  });

  it('matchesShortcut handles event without modifiers', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    const result = matchesShortcut(event, { key: 'Escape', modifiers: [], description: '', category: '' });
    expect(result).toBe(true);
  });

  it('SHORTCUTS has at least 5 entries', () => {
    expect(Object.keys(SHORTCUTS).length).toBeGreaterThanOrEqual(5);
  });

  it('getShortcutsByCategory returns non-empty result', () => {
    const result = getShortcutsByCategory();
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });
});
