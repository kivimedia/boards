'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useBoard } from '@/hooks/useBoard';
import Board from './Board';
import ListView from './ListView';
import CalendarView from './CalendarView';
import BoardHeader from './BoardHeader';
import SavedFilterBar from './SavedFilterBar';
import BottomNavBar from '@/components/bottom-nav/BottomNavBar';
import InboxView from '@/components/bottom-nav/InboxView';
import PlannerView from '@/components/bottom-nav/PlannerView';
import { useProfilingStore, BoardProfilingData } from '@/stores/profiling-store';
import { BoardWithLists, BoardViewMode, BoardFilter } from '@/lib/types';

function isDarkColor(color: string | null | undefined): boolean {
  if (!color) return false;
  // Handle gradients — extract first color
  const match = color.match(/#([0-9a-fA-F]{6})/);
  if (!match) return false;
  const hex = match[1];
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

interface BoardViewProps {
  boardId: string;
  boardName: string;
  initialBoard?: BoardWithLists;
  initialTimings?: BoardProfilingData;
}

export default function BoardView({ boardId, boardName, initialBoard, initialTimings }: BoardViewProps) {
  const { board, loading, isPlaceholderData, refresh } = useBoard(boardId, initialBoard);
  const searchParams = useSearchParams();
  const mountTimeRef = useRef(performance.now());
  const renderTrackedRef = useRef(false);

  // Push SSR timings to profiling store on mount
  // Hydrate enabled state from localStorage FIRST, then push timings
  useEffect(() => {
    const stored = typeof window !== 'undefined' && localStorage.getItem('profiling_enabled');
    if (stored === 'false') {
      useProfilingStore.getState().setEnabled(false);
    }
    if (initialTimings) {
      useProfilingStore.getState().setBoardProfiling(initialTimings);
    }
  }, []);

  // Read initial view from URL param (?view=inbox|planner|kanban), default to kanban
  const initialView = (searchParams.get('view') as BoardViewMode) || 'kanban';
  const [viewMode, setViewMode] = useState<BoardViewMode>(
    ['kanban', 'list', 'calendar', 'inbox', 'planner'].includes(initialView) ? initialView : 'kanban'
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(
    searchParams.get('card') || null
  );
  const [prevViewMode, setPrevViewMode] = useState<BoardViewMode>(viewMode);
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const viewContainerRef = useRef<HTMLDivElement>(null);

  // Sync view mode to URL params + save/restore scroll
  const handleViewChange = useCallback((view: BoardViewMode) => {
    // Save current scroll position before switching
    if (viewContainerRef.current) {
      const scrollEl = viewContainerRef.current.querySelector('[data-scroll-container]');
      if (scrollEl) {
        scrollPositions.current.set(viewMode, scrollEl.scrollTop);
      }
    }
    setPrevViewMode(viewMode);
    setViewMode(view);
    const url = new URL(window.location.href);
    if (view === 'kanban') {
      url.searchParams.delete('view'); // kanban is default, keep URL clean
    } else {
      url.searchParams.set('view', view);
    }
    window.history.replaceState({}, '', url.toString());
  }, [viewMode]);

  // Sync URL when card modal opens/closes
  const openCard = useCallback((cardId: string) => {
    setSelectedCardId(cardId);
    const url = new URL(window.location.href);
    url.searchParams.set('card', cardId);
    window.history.replaceState({}, '', url.toString());
  }, []);

  const closeCard = useCallback(() => {
    setSelectedCardId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('card');
    window.history.replaceState({}, '', url.toString());
  }, []);
  const [filter, setFilter] = useState<BoardFilter>({
    labels: [],
    members: [],
    priority: [],
    dueDate: null,
  });

  // Use initialBoard as fallback while loading
  const displayBoard = board || initialBoard;

  // Track client render time - append to profiling data once board is rendered
  useEffect(() => {
    if (displayBoard && !loading && !renderTrackedRef.current) {
      renderTrackedRef.current = true;
      const renderMs = performance.now() - mountTimeRef.current;
      const existing = useProfilingStore.getState().boardProfiling;
      if (existing && !existing.phases.find(p => p.name === 'Client render')) {
        useProfilingStore.getState().setBoardProfiling({
          ...existing,
          phases: [...existing.phases, { name: 'Client render', ms: renderMs }],
        });
      }
    }
  }, [displayBoard, loading]);

  const bgColor = displayBoard?.background_color;
  const bgImage = displayBoard?.background_image_url;
  const hasBackground = !!(bgColor || bgImage);
  const darkBg = isDarkColor(bgColor) || !!bgImage; // assume images are dark-ish

  const isGradient = bgColor?.startsWith('linear-gradient');

  const bgStyle = useMemo(() => {
    if (bgImage) return { backgroundImage: `url(${bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' };
    if (isGradient) return { background: bgColor! };
    if (bgColor) return { backgroundColor: bgColor };
    return {};
  }, [bgColor, bgImage, isGradient]);

  // Restore scroll position after view change
  useEffect(() => {
    if (!viewContainerRef.current) return;
    const savedScroll = scrollPositions.current.get(viewMode);
    if (savedScroll !== undefined) {
      requestAnimationFrame(() => {
        const scrollEl = viewContainerRef.current?.querySelector('[data-scroll-container]');
        if (scrollEl) scrollEl.scrollTop = savedScroll;
      });
    }
  }, [viewMode]);

  const hasActiveFilter = filter.labels.length > 0 || filter.members.length > 0 || filter.priority.length > 0 || filter.dueDate !== null;

  // Whether to show board-specific header (hide for inbox/planner since they have their own headers)
  const showBoardHeader = viewMode === 'kanban' || viewMode === 'list' || viewMode === 'calendar';

  if (loading && !displayBoard) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-400">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-body">Loading board...</span>
        </div>
      </div>
    );
  }

  if (!displayBoard) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-navy/40 dark:text-slate-400 font-body">Board not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden" style={bgStyle}>
      {showBoardHeader && (
        <>
          <BoardHeader
            boardId={boardId}
            boardName={boardName}
            currentView={viewMode}
            onViewChange={handleViewChange}
            hasBackground={hasBackground}
            isDarkBackground={darkBg}
            board={displayBoard}
            filter={filter}
            onFilterChange={setFilter}
            onCardClick={openCard}
            onRefresh={refresh}
          />
          <SavedFilterBar
            boardId={boardId}
            currentFilter={filter}
            onFilterChange={setFilter}
            isDark={darkBg}
          />
        </>
      )}

      {/* Board views with fade transition */}
      <div ref={viewContainerRef} key={viewMode} className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200">
        {viewMode === 'kanban' && (
          <Board
            board={displayBoard}
            onRefresh={refresh}
            filter={hasActiveFilter ? filter : undefined}
            externalSelectedCardId={selectedCardId}
            onExternalCardClose={closeCard}
            isLoadingCards={isPlaceholderData}
          />
        )}
        {viewMode === 'list' && <ListView lists={displayBoard.lists} boardId={boardId} />}
        {viewMode === 'calendar' && <CalendarView lists={displayBoard.lists} />}

        {/* New views from Bottom Nav */}
        {viewMode === 'inbox' && <InboxView currentBoardId={boardId} onCardClick={openCard} />}
        {viewMode === 'planner' && <PlannerView board={displayBoard} onCardClick={openCard} onRefresh={refresh} />}
      </div>

      {/* Bottom Navigation Bar */}
      <BottomNavBar
        activeView={viewMode}
        onViewChange={handleViewChange}
        boardId={boardId}
      />

    </div>
  );
}
