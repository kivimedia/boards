'use client';

import { useState } from 'react';
import NavTab from './NavTab';
import BoardSwitcher from './BoardSwitcher';
import type { BoardViewMode } from '@/lib/types';

interface BottomNavBarProps {
  activeView: BoardViewMode;
  onViewChange: (view: BoardViewMode) => void;
  boardId: string;
}

// Icons as inline SVGs
const InboxIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const PlannerIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const BoardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
  </svg>
);

const SwitchIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

export default function BottomNavBar({ activeView, onViewChange, boardId }: BottomNavBarProps) {
  const [showSwitcher, setShowSwitcher] = useState(false);

  const tabs: { view: BoardViewMode | 'switch'; label: string; icon: JSX.Element }[] = [
    { view: 'inbox', label: 'Inbox', icon: <InboxIcon /> },
    { view: 'planner', label: 'Planner', icon: <PlannerIcon /> },
    { view: 'kanban', label: 'Board', icon: <BoardIcon /> },
    { view: 'switch', label: 'Switch', icon: <SwitchIcon /> },
  ];

  return (
    <>
      <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-2 py-1.5 bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 rounded-2xl shadow-lg shadow-navy/10 dark:shadow-black/30 safe-area-inset-bottom">
        {tabs.map((tab) => (
          <NavTab
            key={tab.view}
            icon={tab.icon}
            label={tab.label}
            isActive={tab.view !== 'switch' && activeView === tab.view}
            onClick={() => {
              if (tab.view === 'switch') {
                setShowSwitcher(true);
              } else {
                onViewChange(tab.view);
              }
            }}
          />
        ))}
      </div>

      {showSwitcher && (
        <BoardSwitcher
          currentBoardId={boardId}
          onClose={() => setShowSwitcher(false)}
        />
      )}
    </>
  );
}
