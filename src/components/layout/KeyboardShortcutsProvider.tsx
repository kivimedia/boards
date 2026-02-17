'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import ShortcutHelpModal from '@/components/search/ShortcutHelpModal';

export default function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [showHelp, setShowHelp] = useState(false);
  const router = useRouter();

  const handlers = useMemo(
    () => ({
      'show-help': () => setShowHelp(true),
      'escape': () => setShowHelp(false),
      'go-home': () => router.push('/'),
      'go-settings': () => router.push('/settings'),
      'open-search': () => {
        // Focus the global search input if it exists
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
        if (searchInput) {
          searchInput.focus();
        }
      },
      'open-search-ctrl': () => {
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
        if (searchInput) {
          searchInput.focus();
        }
      },
    }),
    [router]
  );

  useKeyboardShortcuts(handlers);

  return (
    <>
      {children}
      <ShortcutHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </>
  );
}
