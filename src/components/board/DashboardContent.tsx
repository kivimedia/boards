'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Board } from '@/lib/types';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import CreateBoardModal from './CreateBoardModal';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';

interface ActivityItem {
  id: string;
  content: string;
  created_at: string;
  card_id: string;
  card_title: string;
  user_name: string;
  user_avatar: string | null;
}

interface DashboardStats {
  assignedCount: number;
  overdueCount: number;
  dueThisWeekCount: number;
  recentActivity: ActivityItem[];
}

interface DashboardContentProps {
  initialBoards: Board[];
  stats?: DashboardStats;
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export default function DashboardContent({ initialBoards, stats }: DashboardContentProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [showArchived, setShowArchived] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const toggleStar = useCallback(async (e: React.MouseEvent, boardId: string, currentStarred: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setBoards(prev => prev.map(b => b.id === boardId ? { ...b, is_starred: !currentStarred } : b));
    await supabase.from('boards').update({ is_starred: !currentStarred }).eq('id', boardId);
  }, [supabase]);

  const toggleArchive = useCallback(async (e: React.MouseEvent, boardId: string, currentArchived: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setBoards(prev => prev.map(b => b.id === boardId ? { ...b, is_archived: !currentArchived } : b));
    await supabase.from('boards').update({ is_archived: !currentArchived }).eq('id', boardId);
  }, [supabase]);

  const activeBoards = useMemo(() =>
    boards.filter(b => !b.is_archived).sort((a, b) => (a.is_starred === b.is_starred ? 0 : a.is_starred ? -1 : 1)),
    [boards]
  );

  const archivedBoards = useMemo(() => boards.filter(b => b.is_archived), [boards]);

  const renderBoardCard = (board: Board, isArchived = false) => {
    const config = BOARD_TYPE_CONFIG[board.type];
    return (
      <div key={board.id} className={`relative group ${isArchived ? 'opacity-60' : ''}`}>
        <Link
          href={`/board/${board.id}`}
          className="block bg-white dark:bg-dark-surface rounded-2xl p-5 shadow-card dark:shadow-none dark:border dark:border-slate-700 hover:shadow-card-hover hover:translate-y-[-2px] border border-transparent hover:border-electric/20 transition-all duration-200"
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: `${config?.color || '#3b82f6'}15` }}
            >
              {config?.icon || '\u{1F4CB}'}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-navy dark:text-slate-100 font-heading truncate">
                {board.name}
              </h3>
              <p className="text-sm text-navy/60 dark:text-slate-400 font-body mt-0.5">
                {config?.label || board.type}
              </p>
            </div>
            {/* Star + Archive buttons */}
            <div className="shrink-0 flex items-center gap-1">
              <button
                onClick={(e) => toggleStar(e, board.id, board.is_starred)}
                className={`p-1 rounded transition-all ${
                  board.is_starred
                    ? 'text-yellow-400'
                    : 'text-navy/0 group-hover:text-navy/20 dark:group-hover:text-slate-500 hover:!text-yellow-400'
                }`}
                title={board.is_starred ? 'Unstar' : 'Star'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={board.is_starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
              <button
                onClick={(e) => toggleArchive(e, board.id, board.is_archived)}
                className="p-1 rounded transition-all text-navy/0 group-hover:text-navy/20 dark:group-hover:text-slate-500 hover:!text-navy dark:hover:!text-slate-200"
                title={board.is_archived ? 'Unarchive' : 'Archive'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {board.is_archived ? (
                    <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></>
                  ) : (
                    <><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></>
                  )}
                </svg>
              </button>
            </div>
          </div>
        </Link>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Stats Row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Link
              href="/my-tasks"
              className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-card dark:shadow-none dark:border dark:border-slate-700 hover:shadow-card-hover hover:translate-y-[-1px] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-electric/10 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F6BFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <p className="text-xl font-heading font-bold text-navy dark:text-slate-100">{stats.assignedCount}</p>
                  <p className="text-[11px] text-navy/50 dark:text-slate-400 font-body">My tasks</p>
                </div>
              </div>
            </Link>

            {stats.overdueCount > 0 ? (
              <Link
                href="/my-tasks"
                className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 shadow-card dark:shadow-none border border-red-200 dark:border-red-800/40 hover:shadow-card-hover hover:translate-y-[-1px] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xl font-heading font-bold text-red-600 dark:text-red-400">{stats.overdueCount}</p>
                    <p className="text-[11px] text-red-500/70 dark:text-red-400/60 font-body">Overdue</p>
                  </div>
                </div>
              </Link>
            ) : (
              <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-card dark:shadow-none dark:border dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xl font-heading font-bold text-green-600 dark:text-green-400">0</p>
                    <p className="text-[11px] text-navy/50 dark:text-slate-400 font-body">Overdue</p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-card dark:shadow-none dark:border dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <p className="text-xl font-heading font-bold text-navy dark:text-slate-100">{stats.dueThisWeekCount}</p>
                  <p className="text-[11px] text-navy/50 dark:text-slate-400 font-body">Due this week</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-dark-surface rounded-xl p-4 shadow-card dark:shadow-none dark:border dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </div>
                <div>
                  <p className="text-xl font-heading font-bold text-navy dark:text-slate-100">{activeBoards.length}</p>
                  <p className="text-[11px] text-navy/50 dark:text-slate-400 font-body">Active boards</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-navy dark:text-white font-heading">Your Boards</h2>
            <p className="text-navy/70 dark:text-slate-300 mt-1 font-body text-sm sm:text-base">Manage your projects</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            + New Board
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeBoards.map((board) => renderBoardCard(board))}

          {/* Create new board card */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-cream-dark/50 dark:bg-slate-800/50 rounded-2xl p-5 border-2 border-dashed border-cream-dark dark:border-slate-700 hover:border-electric/30 hover:bg-cream-dark dark:hover:bg-slate-800 transition-all duration-200 flex items-center justify-center min-h-[88px] group"
          >
            <div className="text-center">
              <span className="text-2xl text-navy/40 dark:text-slate-400 group-hover:text-electric/60 transition-colors">+</span>
              <p className="text-sm text-navy/50 dark:text-slate-400 group-hover:text-navy/70 dark:group-hover:text-slate-300 font-body mt-1 transition-colors">
                Create Board
              </p>
            </div>
          </button>
        </div>

        {/* Recent Activity */}
        {stats && stats.recentActivity.length > 0 && (
          <div className="mt-8">
            <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100 mb-3">
              Recent Activity
            </h3>
            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-cream-dark dark:border-slate-700 divide-y divide-cream-dark/50 dark:divide-slate-700/50 overflow-hidden">
              {stats.recentActivity.map((item) => (
                <Link
                  key={item.id}
                  href={`/card/${item.card_id}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-cream/50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <Avatar name={item.user_name} src={item.user_avatar} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-navy dark:text-slate-200 font-body">
                      <span className="font-semibold">{item.user_name}</span>
                      {' commented on '}
                      <span className="font-semibold">{item.card_title}</span>
                    </p>
                    <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5 line-clamp-1">
                      {item.content}
                    </p>
                  </div>
                  <span className="text-[10px] text-navy/30 dark:text-slate-500 font-body whitespace-nowrap shrink-0">
                    {getRelativeTime(item.created_at)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Archived boards section */}
        {archivedBoards.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 text-sm text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-400 transition-colors mb-4"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={showArchived ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
              </svg>
              <span>Archived Boards ({archivedBoards.length})</span>
            </button>
            {showArchived && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedBoards.map((board) => renderBoardCard(board, true))}
              </div>
            )}
          </div>
        )}
      </div>

      <CreateBoardModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
