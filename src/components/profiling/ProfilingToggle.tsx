'use client';

import { useEffect } from 'react';
import { useProfilingStore } from '@/stores/profiling-store';

interface ProfilingToggleProps {
  isDark?: boolean;
}

export default function ProfilingToggle({ isDark }: ProfilingToggleProps) {
  const { enabled, toggleEnabled, boardProfiling, cardProfiling, setEnabled, showBoardPopup, showCardPopup } = useProfilingStore();

  // Hydrate from localStorage on mount (default is enabled, only disable if explicitly set to false)
  useEffect(() => {
    const stored = localStorage.getItem('profiling_enabled');
    if (stored === 'false') {
      setEnabled(false);
    }
  }, [setEnabled]);

  const handleClick = () => {
    if (enabled) {
      // If popup is hidden but data exists, re-show it. Otherwise toggle off.
      if (!showBoardPopup && boardProfiling) {
        useProfilingStore.getState().setBoardProfiling(boardProfiling);
        return;
      }
      if (!showCardPopup && cardProfiling) {
        useProfilingStore.getState().setCardProfiling(cardProfiling);
        return;
      }
    }
    toggleEnabled();
  };

  return (
    <button
      onClick={handleClick}
      title={enabled ? 'Profiling enabled (click to disable)' : 'Enable profiling'}
      className={`
        p-1.5 rounded-lg transition-colors
        ${enabled
          ? 'text-electric bg-electric/10 hover:bg-electric/20'
          : isDark
            ? 'text-white/60 hover:text-white/80 hover:bg-white/10'
            : 'text-navy/40 dark:text-slate-400 hover:text-navy/60 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-700'
        }
      `}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    </button>
  );
}
