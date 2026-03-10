'use client';

import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import type { BoardType } from '@/lib/types';

interface PipelineBoard {
  id: string;
  name: string;
  type: string;
  color: string;
  activeCount: number;
}

interface PipelineViewProps {
  boards: PipelineBoard[];
}

export default function PipelineView({ boards }: PipelineViewProps) {
  if (boards.length === 0) {
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
        {boards.map((node, index) => {
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
              {index < boards.length - 1 && (
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
