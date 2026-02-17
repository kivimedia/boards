'use client';

import { useEffect, useCallback } from 'react';
import { SHORTCUTS, matchesShortcut } from '@/lib/keyboard-shortcuts';

type ShortcutHandler = () => void;

export function useKeyboardShortcuts(handlers: Record<string, ShortcutHandler>) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs/textareas
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Allow Escape in inputs
        if (event.key !== 'Escape') return;
      }

      for (const [shortcutId, handler] of Object.entries(handlers)) {
        const shortcut = SHORTCUTS[shortcutId];
        if (shortcut && matchesShortcut(event, shortcut)) {
          event.preventDefault();
          handler();
          return;
        }
      }
    },
    [handlers]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
