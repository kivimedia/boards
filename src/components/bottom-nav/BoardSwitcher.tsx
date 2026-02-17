'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Board, BoardType } from '@/lib/types';

const BOARD_TYPE_OPTIONS: { value: BoardType; label: string }[] = [
  { value: 'dev', label: 'Development' },
  { value: 'training', label: 'Training' },
  { value: 'account_manager', label: 'Account Manager' },
  { value: 'graphic_designer', label: 'Graphic Designer' },
  { value: 'executive_assistant', label: 'Executive Assistant' },
  { value: 'video_editor', label: 'Video Editor' },
  { value: 'copy', label: 'Copy' },
  { value: 'client_strategy_map', label: 'Client Strategy Map' },
];

interface BoardSwitcherProps {
  currentBoardId: string;
  onClose: () => void;
}

function getBoardIcon(type: string) {
  switch (type) {
    case 'dev': return 'D';
    case 'training': return 'T';
    case 'account_manager': return 'A';
    case 'graphic_designer': return 'G';
    case 'executive_assistant': return 'E';
    case 'video_editor': return 'V';
    case 'copy': return 'C';
    case 'client_strategy_map': return 'S';
    default: return 'B';
  }
}

function formatBoardType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function BoardSwitcher({ currentBoardId, onClose }: BoardSwitcherProps) {
  const [boards, setBoards] = useState<(Board & { card_count?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<BoardType>('dev');
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchBoards = async () => {
      try {
        const [boardsRes, countsRes] = await Promise.all([
          fetch('/api/boards'),
          fetch('/api/boards/counts'),
        ]);
        if (!boardsRes.ok) { setLoading(false); return; }
        const { data } = await boardsRes.json();
        const counts: Record<string, number> = countsRes.ok ? await countsRes.json() : {};
        if (data) {
          // Sort: starred first, then by name. Filter out archived.
          const sorted = (data as Board[])
            .filter((b: Board) => !b.is_archived)
            .sort((a: Board, b: Board) => {
              if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((b: Board) => ({ ...b, card_count: counts[b.id] ?? 0 }));
          setBoards(sorted);
        }
      } catch {
        // ignore fetch errors
      }
      setLoading(false);
    };

    fetchBoards();
    searchRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Close on Escape
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const handleCreateBoard = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: newType }),
      });
      if (res.ok) {
        const { data: board } = await res.json();
        if (board?.id) {
          router.push(`/board/${board.id}`);
          onClose();
          return;
        }
      }
    } catch {
      // ignore
    }
    setCreating(false);
  };

  const filtered = boards.filter(
    (b) => b.name.toLowerCase().includes(search.toLowerCase()) || b.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-lg mb-20 mx-4 bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 rounded-2xl shadow-2xl max-h-[60vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200"
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-cream-dark dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold font-headline text-navy dark:text-white">Switch Board</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreate(!showCreate)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-body font-medium rounded-lg bg-electric/10 text-electric hover:bg-electric/20 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Board
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 text-navy/40 dark:text-slate-500 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Create board inline form */}
          {showCreate && (
            <div className="mb-3 p-3 bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 rounded-xl space-y-2">
              <input
                type="text"
                placeholder="Board name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateBoard()}
                className="w-full px-3 py-1.5 text-sm bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 rounded-lg text-navy dark:text-white placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-electric/30 font-body"
                autoFocus
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as BoardType)}
                className="w-full px-3 py-1.5 text-sm bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 rounded-lg text-navy dark:text-white outline-none focus:ring-2 focus:ring-electric/30 font-body"
              >
                {BOARD_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreateBoard}
                  disabled={creating || !newName.trim()}
                  className="flex-1 px-3 py-1.5 text-xs font-body font-medium rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Board'}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                  className="px-3 py-1.5 text-xs font-body text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <input
            ref={searchRef}
            type="text"
            placeholder="Search boards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 rounded-lg text-navy dark:text-white placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-electric/30 font-body"
          />
        </div>

        {/* Board list - flat 3-col grid */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-5 w-5 text-electric" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-navy/40 dark:text-slate-500 py-8 font-body">No boards found</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {filtered.map((board) => (
                <button
                  key={board.id}
                  onClick={() => {
                    if (board.id !== currentBoardId) {
                      router.push(`/board/${board.id}`);
                    }
                    onClose();
                  }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all text-center ${
                    board.id === currentBoardId
                      ? 'bg-electric/10 dark:bg-electric/20 border border-electric/30'
                      : 'bg-cream/50 dark:bg-slate-800/50 border border-cream-dark/50 dark:border-slate-700/50 hover:bg-cream-dark/50 dark:hover:bg-slate-800 hover:border-electric/20'
                  }`}
                >
                  {/* Board icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: board.background_color || '#6366f1' }}
                  >
                    {getBoardIcon(board.type)}
                  </div>

                  <div className="min-w-0 w-full">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs font-medium text-navy dark:text-white truncate font-body">
                        {board.name}
                      </span>
                      {board.is_starred && (
                        <svg className="w-3 h-3 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      )}
                    </div>
                    <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                      <span className="px-1 py-px rounded bg-cream-dark/60 dark:bg-slate-700/60 mr-1">{formatBoardType(board.type)}</span>
                      {board.card_count} cards
                      {board.id === currentBoardId && <span className="text-electric ml-1">Current</span>}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
