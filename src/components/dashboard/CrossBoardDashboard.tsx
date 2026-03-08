'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import PipelineView from '@/components/dashboard/PipelineView';
import type { Board, BoardType } from '@/lib/types';
import { slugify } from '@/lib/slugify';

interface ListSummary {
  id: string;
  name: string;
  cardCount: number;
}

interface BoardSummary {
  board: Board;
  totalCards: number;
  lists: ListSummary[];
  recentlyMoved: number;
}

export default function CrossBoardDashboard() {
  const [boardSummaries, setBoardSummaries] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch all boards
        const { data: boards } = await supabase
          .from('boards')
          .select('*')
          .order('created_at', { ascending: true });

        if (!boards || boards.length === 0) {
          setBoardSummaries([]);
          setLoading(false);
          return;
        }

        // Batch: fetch all lists at once
        const { data: allLists } = await supabase
          .from('lists')
          .select('id, name, position, board_id')
          .order('position', { ascending: true });

        // Batch: count cards per list using a single query with group by
        const { data: placementCounts } = await supabase
          .from('card_placements')
          .select('list_id');

        // Build a count map from placements
        const listCardCounts = new Map<string, number>();
        if (placementCounts) {
          for (const p of placementCounts) {
            listCardCounts.set(p.list_id, (listCardCounts.get(p.list_id) || 0) + 1);
          }
        }

        // Batch: count recently moved cards per board (last 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentMoves } = await supabase
          .from('activity_log')
          .select('board_id')
          .eq('event_type', 'card_moved')
          .gte('created_at', oneDayAgo);

        const recentMoveCounts = new Map<string, number>();
        if (recentMoves) {
          for (const m of recentMoves) {
            recentMoveCounts.set(m.board_id, (recentMoveCounts.get(m.board_id) || 0) + 1);
          }
        }

        // Group lists by board
        const listsByBoard = new Map<string, typeof allLists>();
        for (const list of allLists || []) {
          if (!listsByBoard.has(list.board_id)) listsByBoard.set(list.board_id, []);
          listsByBoard.get(list.board_id)!.push(list);
        }

        // Assemble summaries
        const summaries: BoardSummary[] = boards.map((board) => {
          const boardLists = listsByBoard.get(board.id) || [];
          let totalCards = 0;
          const listSummaries: ListSummary[] = boardLists.map((list) => {
            const cardCount = listCardCounts.get(list.id) || 0;
            totalCards += cardCount;
            return { id: list.id, name: list.name, cardCount };
          });
          return {
            board,
            totalCards,
            lists: listSummaries,
            recentlyMoved: recentMoveCounts.get(board.id) || 0,
          };
        });

        setBoardSummaries(summaries);
      } catch (err) {
        console.error('Dashboard fetch failed:', err);
        setBoardSummaries([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-cream dark:bg-navy p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  const boardsForPipeline = boardSummaries.map((s) => ({
    id: s.board.id,
    name: s.board.name,
    type: s.board.type,
    color: BOARD_TYPE_CONFIG[s.board.type as BoardType]?.color || '#6366f1',
  }));

  return (
    <div className="flex-1 overflow-y-auto bg-cream p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <p className="text-navy/60 dark:text-slate-400 font-body text-sm">
          Executive overview of all boards and cross-board activity.
        </p>

        {/* Pipeline View */}
        <PipelineView boards={boardsForPipeline} />

        {/* Board Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boardSummaries.map((summary) => {
            const config = BOARD_TYPE_CONFIG[summary.board.type as BoardType];
            const boardColor = config?.color || '#6366f1';
            const maxCardCount = Math.max(...summary.lists.map((l) => l.cardCount), 1);

            return (
              <Link
                key={summary.board.id}
                href={`/board/${slugify(summary.board.name)}`}
                className="group block bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-transparent p-5 transition-all duration-200 hover:shadow-lg dark:hover:shadow-none"
                style={{
                  ['--board-color' as string]: boardColor,
                }}
              >
                {/* Board Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style={{ backgroundColor: `${boardColor}15` }}
                  >
                    {config?.icon || '📋'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading truncate">
                      {summary.board.name}
                    </h3>
                    <p className="text-xs text-navy/40 dark:text-slate-400 font-body">
                      {config?.label || summary.board.type}
                    </p>
                  </div>
                  <div
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: boardColor }}
                  >
                    {summary.totalCards}
                  </div>
                </div>

                {/* Mini Bar Chart - Cards per List */}
                {summary.lists.length > 0 && (
                  <div className="space-y-1.5 mb-4">
                    {summary.lists.slice(0, 6).map((list) => (
                      <div key={list.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-navy/40 dark:text-slate-400 font-body w-14 sm:w-20 truncate shrink-0">
                          {list.name}
                        </span>
                        <div className="flex-1 h-2 bg-cream-dark dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max((list.cardCount / maxCardCount) * 100, list.cardCount > 0 ? 8 : 0)}%`,
                              backgroundColor: boardColor,
                              opacity: 0.7,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-navy/50 dark:text-slate-400 font-body w-4 text-right shrink-0">
                          {list.cardCount}
                        </span>
                      </div>
                    ))}
                    {summary.lists.length > 6 && (
                      <p className="text-[10px] text-navy/30 dark:text-slate-500 font-body text-center">
                        +{summary.lists.length - 6} more lists
                      </p>
                    )}
                  </div>
                )}

                {/* Footer Stats */}
                <div className="flex items-center justify-between pt-3 border-t border-cream-dark/50 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 text-navy/40 dark:text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                    <span className="text-[10px] font-body">
                      {summary.recentlyMoved} moved (24h)
                    </span>
                  </div>
                  <span className="text-[10px] text-navy/30 dark:text-slate-500 font-body">
                    {summary.lists.length} lists
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {boardSummaries.length === 0 && (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-cream-dark dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30 dark:text-slate-400">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
              </svg>
            </div>
            <p className="text-sm text-navy/40 dark:text-slate-400 font-body">
              No boards created yet. Create a board to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
