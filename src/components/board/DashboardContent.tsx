'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Board } from '@/lib/types';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import CreateBoardModal from './CreateBoardModal';
import Button from '@/components/ui/Button';

interface DashboardContentProps {
  initialBoards: Board[];
}

export default function DashboardContent({ initialBoards }: DashboardContentProps) {
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
              {config?.icon || '📋'}
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
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-navy dark:text-white font-heading">Your Boards</h2>
            <p className="text-navy/70 dark:text-slate-300 mt-1 font-body">Manage your projects</p>
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
