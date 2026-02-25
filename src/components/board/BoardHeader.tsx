'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ViewSwitcher from './ViewSwitcher';
import BoardMemberAvatars from './BoardMemberAvatars';
import ThemeToggle from '@/components/layout/ThemeToggle';
import { usePresence } from '@/hooks/usePresence';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import BoardBackgroundPicker from './BoardBackgroundPicker';
import SmartSearchBar from '@/components/smart-search/SearchBar';
import FilterDropdown from './FilterDropdown';
import DedupModal from './DedupModal';
import ShareButton from '@/components/team-presence/ShareButton';
import ShareModal from '@/components/team-presence/ShareModal';
import ProfilingToggle from '@/components/profiling/ProfilingToggle';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import type { BoardViewMode, BoardWithLists, BoardFilter } from '@/lib/types';

interface BoardHeaderProps {
  boardId: string;
  boardName: string;
  currentView: BoardViewMode;
  onViewChange: (view: BoardViewMode) => void;
  hasBackground?: boolean;
  isDarkBackground?: boolean;
  board?: BoardWithLists;
  filter?: BoardFilter;
  onFilterChange?: (filter: BoardFilter) => void;
  onCardClick?: (cardId: string) => void;
  onRefresh?: () => void;
  onCreateCard?: () => void;
}

export default function BoardHeader({
  boardId,
  boardName,
  currentView,
  onViewChange,
  hasBackground,
  isDarkBackground,
  board,
  filter,
  onFilterChange,
  onCardClick,
  onRefresh,
  onCreateCard,
}: BoardHeaderProps) {
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showDedup, setShowDedup] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isStarred, setIsStarred] = useState(board?.is_starred ?? false);
  const [isArchived, setIsArchived] = useState(board?.is_archived ?? false);
  const supabase = createClient();
  const router = useRouter();
  const { presentUsers } = usePresence({ channelName: `board:${boardId}` });
  const onlineUserIds = useMemo(
    () => new Set(presentUsers.filter((u) => u.status === 'online' || !u.status).map((u) => u.userId)),
    [presentUsers]
  );
  const awayUserIds = useMemo(
    () => new Set(presentUsers.filter((u) => u.status === 'away').map((u) => u.userId)),
    [presentUsers]
  );

  const toggleStar = useCallback(async () => {
    const next = !isStarred;
    setIsStarred(next);
    await supabase.from('boards').update({ is_starred: next }).eq('id', boardId);
  }, [isStarred, boardId, supabase]);

  const toggleArchive = useCallback(async () => {
    const next = !isArchived;
    setIsArchived(next);
    await supabase.from('boards').update({ is_archived: next }).eq('id', boardId);
    if (next) router.push('/');
  }, [isArchived, boardId, supabase, router]);

  const headerBg = hasBackground && isDarkBackground
    ? 'bg-black/30 backdrop-blur-md border-b border-white/10'
    : hasBackground
    ? 'bg-white/60 backdrop-blur-md border-b border-cream-dark/50'
    : 'bg-cream/80 dark:bg-navy-light/80 backdrop-blur-md border-b border-cream-dark dark:border-slate-700';

  const textColor = hasBackground && isDarkBackground
    ? 'text-white'
    : 'text-navy dark:text-white';

  const subtleColor = hasBackground && isDarkBackground
    ? 'text-white/60'
    : 'text-navy/40 dark:text-slate-400';

  const dividerColor = hasBackground && isDarkBackground
    ? 'bg-white/20'
    : 'bg-cream-dark dark:bg-slate-700';

  const { toggleMobileSidebar } = useAppStore();

  return (
    <header className={`${headerBg} shrink-0 relative z-[100]`}>
      {/* Mobile search bar - prominent placement at top */}
      {onCardClick && (
        <div className="sm:hidden px-3 py-2 border-b border-cream-dark/50 dark:border-slate-700/50">
          <SmartSearchBar 
            boardId={boardId} 
            onCardClick={onCardClick} 
            onOpenShareModal={() => setShowShare(true)} 
            onCreateCard={onCreateCard} 
            isDark={hasBackground && isDarkBackground}
          />
        </div>
      )}

      <div className="flex items-center justify-between px-3 sm:px-6 h-14 gap-2">
        {/* Left side */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {/* Mobile hamburger */}
          <button
            onClick={toggleMobileSidebar}
            className={`md:hidden p-2 rounded-lg transition-colors shrink-0 ${
              hasBackground && isDarkBackground
                ? 'text-white/70 hover:text-white hover:bg-white/10'
                : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream-dark dark:hover:bg-slate-800'
            }`}
            aria-label="Toggle navigation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <h1 className={`text-sm sm:text-lg font-semibold font-heading truncate max-w-[120px] sm:max-w-none ${textColor}`}>
            {boardName}
          </h1>
          {/* Star toggle */}
          <button
            onClick={toggleStar}
            className={`p-2 rounded transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ${
              isStarred
                ? 'text-yellow-400'
                : `${subtleColor} hover:text-yellow-400`
            }`}
            title={isStarred ? 'Unstar board' : 'Star board'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          {/* Archive toggle — desktop only */}
          <button
            onClick={toggleArchive}
            className={`hidden sm:flex p-2 rounded transition-colors min-w-[36px] min-h-[36px] items-center justify-center ${subtleColor} hover:${textColor}`}
            title={isArchived ? 'Unarchive board' : 'Archive board'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isArchived ? (
                <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>
              ) : (
                <><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></>
              )}
            </svg>
          </button>
          <ViewSwitcher currentView={currentView} onViewChange={onViewChange} />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Smart Search Bar with AI + Create — hidden on mobile, shown on sm+ */}
          <div className="hidden sm:flex">
            {onCardClick && (
              <SmartSearchBar boardId={boardId} onCardClick={onCardClick} onOpenShareModal={() => setShowShare(true)} onCreateCard={onCreateCard} isDark={hasBackground && isDarkBackground} />
            )}
          </div>

          {/* Mobile: quick create button */}
          {onCreateCard && (
            <button
              onClick={onCreateCard}
              className={`sm:hidden p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ${
                hasBackground && isDarkBackground
                  ? 'text-white/70 hover:text-white hover:bg-white/10'
                  : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream-dark dark:hover:bg-slate-800'
              }`}
              title="Create card"
              aria-label="Create card"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}

          {/* Filter */}
          {filter && onFilterChange && board && (
            <FilterDropdown
              filter={filter}
              onFilterChange={onFilterChange}
              labels={board.labels || []}
              boardId={boardId}
              isDark={hasBackground && isDarkBackground}
            />
          )}

          <div className={`w-px h-5 ${dividerColor} hidden sm:block`} />

          {/* Background picker — hidden on mobile */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => setShowBgPicker(!showBgPicker)}
              title="Board background"
              className={`p-2 rounded-lg transition-colors ${
                hasBackground && isDarkBackground
                  ? 'text-white/70 hover:text-white hover:bg-white/10'
                  : 'text-navy/40 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream-dark dark:hover:bg-slate-800'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
            {showBgPicker && (
              <BoardBackgroundPicker
                boardId={boardId}
                currentColor={board?.background_color}
                currentImage={board?.background_image_url}
                onUpdate={() => {
                  setShowBgPicker(false);
                  onRefresh?.();
                }}
                onClose={() => setShowBgPicker(false)}
              />
            )}
          </div>

          {/* Dedup button — hidden on mobile */}
          <button
            onClick={() => setShowDedup(true)}
            title="Find &amp; remove duplicate cards"
            className={`hidden sm:flex p-2 rounded-lg transition-colors items-center justify-center ${
              hasBackground && isDarkBackground
                ? 'text-white/70 hover:text-white hover:bg-white/10'
                : 'text-navy/40 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream-dark dark:hover:bg-slate-800'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="12" height="14" rx="2" /><rect x="8" y="6" width="12" height="14" rx="2" />
            </svg>
          </button>

          <div className={`w-px h-5 ${dividerColor} hidden sm:block`} />

          {/* Desktop: show all controls */}
          <div className="hidden sm:flex items-center gap-2">
            <BoardMemberAvatars boardId={boardId} onlineUserIds={onlineUserIds} awayUserIds={awayUserIds} />
            <ShareButton onClick={() => setShowShare(true)} isDark={hasBackground && isDarkBackground} />
            <div className={`w-px h-5 ${dividerColor}`} />
            <ProfilingToggle isDark={hasBackground && isDarkBackground} />
            <ThemeToggle />
            <NotificationCenter />
          </div>

          {/* Mobile: condensed controls + more menu */}
          <div className="flex sm:hidden items-center gap-1">
            <NotificationCenter />
            <ThemeToggle />
            
            {/* More menu button */}
            <div className="relative">
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className={`p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center ${
                  hasBackground && isDarkBackground
                    ? 'text-white/70 hover:text-white hover:bg-white/10'
                    : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream-dark dark:hover:bg-slate-800'
                }`}
                aria-label="More options"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>

              {/* Mobile menu dropdown */}
              {showMobileMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-cream-dark dark:border-slate-700 py-2 z-50">
                  <button
                    onClick={() => {
                      setShowShare(true);
                      setShowMobileMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm font-body text-navy dark:text-white hover:bg-cream dark:hover:bg-slate-800 flex items-center gap-3"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    Share
                  </button>

                  <button
                    onClick={() => {
                      setShowBgPicker(true);
                      setShowMobileMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm font-body text-navy dark:text-white hover:bg-cream dark:hover:bg-slate-800 flex items-center gap-3"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    Background
                  </button>

                  <button
                    onClick={() => {
                      setShowDedup(true);
                      setShowMobileMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm font-body text-navy dark:text-white hover:bg-cream dark:hover:bg-slate-800 flex items-center gap-3"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="4" y="4" width="12" height="14" rx="2" /><rect x="8" y="6" width="12" height="14" rx="2" />
                    </svg>
                    Find Duplicates
                  </button>

                  <button
                    onClick={toggleArchive}
                    className="w-full px-4 py-2.5 text-left text-sm font-body text-navy dark:text-white hover:bg-cream dark:hover:bg-slate-800 flex items-center gap-3"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {isArchived ? (
                        <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>
                      ) : (
                        <><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></>
                      )}
                    </svg>
                    {isArchived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dedup modal */}
      {showDedup && (
        <DedupModal
          boardId={boardId}
          onClose={() => setShowDedup(false)}
          onRefresh={onRefresh}
        />
      )}

      {/* Share modal */}
      {showShare && (
        <ShareModal
          boardId={boardId}
          boardName={boardName}
          onClose={() => setShowShare(false)}
        />
      )}
    </header>
  );
}
