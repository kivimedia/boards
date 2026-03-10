'use client';

import Link from 'next/link';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import type { StuckCard, BoardType } from '@/lib/types';
import { slugify } from '@/lib/slugify';

interface StuckCardsProps {
  cards: StuckCard[];
  daysThreshold: number;
  onThresholdChange: (days: number) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-blue-400',
  none: 'bg-slate-300 dark:bg-slate-600',
};

export default function StuckCards({ cards, daysThreshold, onThresholdChange }: StuckCardsProps) {
  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
            Stuck Cards
          </h3>
          {cards.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-[10px] font-bold text-amber-700 dark:text-amber-400 font-body">
              {cards.length}
            </span>
          )}
        </div>
        <select
          value={daysThreshold}
          onChange={(e) => onThresholdChange(Number(e.target.value))}
          className="text-[10px] font-body text-navy/50 dark:text-slate-400 bg-cream-dark dark:bg-slate-700 border-0 rounded-md px-2 py-1 cursor-pointer focus:ring-1 focus:ring-electric"
        >
          <option value={3}>3+ days</option>
          <option value={5}>5+ days</option>
          <option value={7}>7+ days</option>
        </select>
      </div>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
            All cards are moving
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {cards.map((card) => {
            const config = BOARD_TYPE_CONFIG[card.board_name as BoardType] || null;
            const isOverdue = card.due_date && new Date(card.due_date) < new Date();

            return (
              <Link
                key={card.card_id}
                href={`/board/${slugify(card.board_name)}`}
                className="flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-lg hover:bg-cream-dark/50 dark:hover:bg-slate-800 transition-colors group"
              >
                {/* Priority dot */}
                <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_COLORS[card.priority] || PRIORITY_COLORS.none}`} />

                {/* Title + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-navy dark:text-slate-200 font-body truncate group-hover:text-electric transition-colors">
                    {card.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="text-[9px] font-semibold font-body px-1.5 py-0.5 rounded-sm truncate max-w-[80px]"
                      style={{
                        backgroundColor: config?.color ? `${config.color}15` : '#f1f5f9',
                        color: config?.color || '#64748b',
                      }}
                    >
                      {card.board_name}
                    </span>
                    <span className="text-[9px] text-navy/30 dark:text-slate-600 font-body truncate max-w-[60px]">
                      {card.list_name}
                    </span>
                  </div>
                </div>

                {/* Owner avatar */}
                {card.owner_avatar ? (
                  <img
                    src={card.owner_avatar}
                    alt={card.owner_name || ''}
                    className="w-5 h-5 rounded-full shrink-0"
                  />
                ) : card.owner_name ? (
                  <div className="w-5 h-5 rounded-full bg-cream-dark dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <span className="text-[8px] font-bold text-navy/40 dark:text-slate-400">
                      {card.owner_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                ) : null}

                {/* Days stuck + overdue badge */}
                <div className="flex items-center gap-1 shrink-0">
                  {isOverdue && (
                    <span className="text-[8px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1 py-0.5 rounded font-body">
                      OVERDUE
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-bold font-body px-1.5 py-0.5 rounded-md ${
                      card.days_stuck >= 14
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        : card.days_stuck >= 7
                          ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}
                  >
                    {card.days_stuck}d
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
