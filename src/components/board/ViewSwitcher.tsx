'use client';

import type { BoardViewMode } from '@/lib/types';

interface ViewSwitcherProps {
  currentView: BoardViewMode;
  onViewChange: (view: BoardViewMode) => void;
}

const VIEW_OPTIONS: { mode: BoardViewMode; label: string; icon: JSX.Element }[] = [
  {
    mode: 'kanban',
    label: 'Kanban',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
  },
  {
    mode: 'list',
    label: 'List',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    mode: 'calendar',
    label: 'Calendar',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
];

export default function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  return (
    <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-cream-dark/50 dark:bg-slate-800/50 border border-cream-dark dark:border-slate-700">
      {VIEW_OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          onClick={() => onViewChange(opt.mode)}
          title={opt.label}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium font-body transition-all
            ${currentView === opt.mode
              ? 'bg-electric text-white shadow-sm'
              : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'
            }
          `}
        >
          {opt.icon}
          <span className="hidden sm:inline">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
