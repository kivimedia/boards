'use client';

import { useState, useMemo } from 'react';
import type { RevisionMetrics } from '@/lib/types';

type SortKey = 'ping_pong_count' | 'total_revision_time_minutes' | 'card_id' | 'is_outlier';
type SortDir = 'asc' | 'desc';

interface RevisionTableProps {
  cards: RevisionMetrics[];
  onCardClick?: (cardId: string) => void;
}

export default function RevisionTable({ cards, onCardClick }: RevisionTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('ping_pong_count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    const copy = [...cards];
    copy.sort((a, b) => {
      let aVal: number | string | boolean;
      let bVal: number | string | boolean;

      switch (sortKey) {
        case 'ping_pong_count':
          aVal = a.ping_pong_count;
          bVal = b.ping_pong_count;
          break;
        case 'total_revision_time_minutes':
          aVal = a.total_revision_time_minutes;
          bVal = b.total_revision_time_minutes;
          break;
        case 'card_id':
          aVal = a.card_id;
          bVal = b.card_id;
          break;
        case 'is_outlier':
          aVal = a.is_outlier ? 1 : 0;
          bVal = b.is_outlier ? 1 : 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [cards, sortKey, sortDir]);

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ^' : ' v';
  };

  function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-body">
        <thead>
          <tr className="border-b border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30">
            <th
              className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400 cursor-pointer select-none hover:text-navy dark:hover:text-slate-100"
              onClick={() => handleSort('card_id')}
            >
              Card ID{sortIndicator('card_id')}
            </th>
            <th
              className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400 cursor-pointer select-none hover:text-navy dark:hover:text-slate-100"
              onClick={() => handleSort('ping_pong_count')}
            >
              Ping-Pong Count{sortIndicator('ping_pong_count')}
            </th>
            <th
              className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400 cursor-pointer select-none hover:text-navy dark:hover:text-slate-100"
              onClick={() => handleSort('total_revision_time_minutes')}
            >
              Revision Time{sortIndicator('total_revision_time_minutes')}
            </th>
            <th
              className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400 cursor-pointer select-none hover:text-navy dark:hover:text-slate-100"
              onClick={() => handleSort('is_outlier')}
            >
              Outlier{sortIndicator('is_outlier')}
            </th>
            <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">
              First Revision
            </th>
            <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">
              Last Revision
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((card) => (
            <tr
              key={card.card_id}
              className={`
                border-b border-cream-dark/50 dark:border-slate-700/50 transition-colors
                ${card.is_outlier ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100/60 dark:hover:bg-red-900/30' : 'hover:bg-cream/30 dark:hover:bg-slate-800/30'}
                ${onCardClick ? 'cursor-pointer' : ''}
              `}
              onClick={() => onCardClick?.(card.card_id)}
            >
              <td className="px-4 py-2.5 text-navy dark:text-slate-100 font-mono text-[10px]">
                {card.card_id.substring(0, 8)}...
              </td>
              <td className="px-4 py-2.5 text-navy dark:text-slate-100 font-medium">
                {card.ping_pong_count}
              </td>
              <td className="px-4 py-2.5 text-navy dark:text-slate-100">
                {formatDuration(card.total_revision_time_minutes)}
              </td>
              <td className="px-4 py-2.5">
                {card.is_outlier ? (
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium text-[10px]">
                    OUTLIER
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-navy/5 dark:bg-slate-700 text-navy/40 dark:text-slate-400 font-medium text-[10px]">
                    Normal
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-navy/50 dark:text-slate-400 whitespace-nowrap">
                {card.first_revision_at
                  ? new Date(card.first_revision_at).toLocaleDateString()
                  : '-'}
              </td>
              <td className="px-4 py-2.5 text-navy/50 dark:text-slate-400 whitespace-nowrap">
                {card.last_revision_at
                  ? new Date(card.last_revision_at).toLocaleDateString()
                  : '-'}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-navy/40 dark:text-slate-500">
                No revision metrics available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
