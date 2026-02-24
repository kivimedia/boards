'use client';

import type { RevisionMetrics } from '@/lib/types';

interface OutlierAlertProps {
  outliers: RevisionMetrics[];
  boardId: string;
  onCardClick?: (cardId: string) => void;
}

export default function OutlierAlert({ outliers, boardId, onCardClick }: OutlierAlertProps) {
  if (outliers.length === 0) return null;

  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-red-200 bg-red-100/50 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-red-200 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-red-800 font-heading">
            {outliers.length} Outlier Card{outliers.length !== 1 ? 's' : ''} Detected
          </h3>
          <p className="text-xs text-red-600 font-body">
            These cards exceed the 1.5x average ping-pong threshold for board {boardId.substring(0, 8)}
          </p>
        </div>
      </div>
      <div className="p-5 space-y-2">
        {outliers.map((card) => (
          <div
            key={card.card_id}
            className={`
              flex items-center justify-between px-4 py-3 rounded-xl bg-white dark:bg-dark-surface border border-red-100 dark:border-red-800/30
              ${onCardClick ? 'cursor-pointer hover:border-red-300 transition-colors' : ''}
            `}
            onClick={() => onCardClick?.(card.card_id)}
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] text-navy/50 dark:text-slate-400">{card.card_id.substring(0, 8)}</span>
              <span className="text-xs text-red-700 font-medium font-body">
                {card.ping_pong_count} ping-pongs
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-navy/50 dark:text-slate-400 font-body">
                {card.total_revision_time_minutes}m in revisions
              </span>
              {card.outlier_reason && (
                <span className="text-[10px] text-red-500 font-body max-w-[200px] truncate">
                  {card.outlier_reason}
                </span>
              )}
              {onCardClick && (
                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
