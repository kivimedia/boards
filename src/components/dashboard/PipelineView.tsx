'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import type { BoardType } from '@/lib/types';

interface BoardNode {
  id: string;
  name: string;
  type: string;
  color: string;
  activeCount: number;
}

interface PipelineViewProps {
  boards: { id: string; name: string; type: string; color: string }[];
}

// Lists that are considered "inactive" (backlog or done-type)
const INACTIVE_LIST_PATTERNS = [
  'backlog',
  'done',
  'completed',
  'delivered',
  'deployed',
  'published',
  'closed',
  'approved',
  'archived',
];

function isActiveList(listName: string): boolean {
  return !INACTIVE_LIST_PATTERNS.some((pattern) =>
    listName.toLowerCase().includes(pattern)
  );
}

export default function PipelineView({ boards }: PipelineViewProps) {
  const [boardNodes, setBoardNodes] = useState<BoardNode[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchActiveCounts = async () => {
      setLoading(true);
      const nodes: BoardNode[] = [];

      for (const board of boards) {
        // Get lists for this board
        const { data: lists } = await supabase
          .from('lists')
          .select('id, name')
          .eq('board_id', board.id);

        if (!lists) {
          nodes.push({ ...board, activeCount: 0 });
          continue;
        }

        const activeListIds = lists
          .filter((l) => isActiveList(l.name))
          .map((l) => l.id);

        if (activeListIds.length === 0) {
          nodes.push({ ...board, activeCount: 0 });
          continue;
        }

        // Get card count in active lists
        const { count } = await supabase
          .from('card_placements')
          .select('*', { count: 'exact', head: true })
          .in('list_id', activeListIds);

        nodes.push({ ...board, activeCount: count || 0 });
      }

      setBoardNodes(nodes);
      setLoading(false);
    };

    if (boards.length > 0) {
      fetchActiveCounts();
    } else {
      setLoading(false);
    }
  }, [boards]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <h2 className="text-base font-semibold text-navy dark:text-slate-100 font-heading mb-4">Pipeline Overview</h2>
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (boardNodes.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <h2 className="text-base font-semibold text-navy dark:text-slate-100 font-heading mb-4">Pipeline Overview</h2>
        <p className="text-sm text-navy/40 dark:text-slate-500 font-body text-center py-4">No boards available</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
      <h2 className="text-base font-semibold text-navy dark:text-slate-100 font-heading mb-6">Pipeline Overview</h2>
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {boardNodes.map((node, index) => {
          const config = BOARD_TYPE_CONFIG[node.type as BoardType];
          return (
            <div key={node.id} className="flex items-center shrink-0">
              {/* Board Node */}
              <div
                className="flex flex-col items-center gap-2 px-4 py-3 rounded-xl border-2 min-w-[120px] transition-all duration-200 hover:shadow-md"
                style={{
                  borderColor: node.color || '#e2e8f0',
                  backgroundColor: `${node.color}08`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                  style={{ backgroundColor: `${node.color}15` }}
                >
                  {config?.icon || '📋'}
                </div>
                <span className="text-xs font-semibold text-navy dark:text-slate-100 font-heading text-center leading-tight">
                  {node.name}
                </span>
                <div
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: node.color || '#6366f1' }}
                >
                  {node.activeCount} active
                </div>
              </div>

              {/* Arrow Connector */}
              {index < boardNodes.length - 1 && (
                <div className="flex items-center px-1 shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-navy/20 dark:text-slate-600">
                    <path d="M5 12h14m-4-4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
