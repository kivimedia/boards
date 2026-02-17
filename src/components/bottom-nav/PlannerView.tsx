'use client';

import { useState, useMemo } from 'react';
import type { BoardWithLists, CardPlacementWithMeta } from '@/lib/types';

interface PlannerViewProps {
  board: BoardWithLists;
  onCardClick: (cardId: string) => void;
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'urgent': return 'border-l-red-500';
    case 'high': return 'border-l-orange-500';
    case 'medium': return 'border-l-yellow-500';
    case 'low': return 'border-l-blue-400';
    default: return 'border-l-slate-300 dark:border-l-slate-600';
  }
}

function getWeekDays(weekOffset: number): Date[] {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + (weekOffset * 7)); // Start on Sunday
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function PlannerView({ board, onCardClick }: PlannerViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = getWeekDays(weekOffset);
  const today = new Date();

  // Group cards by due date
  const { cardsByDate, unscheduled } = useMemo(() => {
    const byDate = new Map<string, (CardPlacementWithMeta & { listName: string })[]>();
    const noDate: (CardPlacementWithMeta & { listName: string })[] = [];

    for (const list of board.lists) {
      for (const card of list.cards) {
        if (card.card?.due_date) {
          const dateKey = new Date(card.card.due_date).toISOString().split('T')[0];
          const arr = byDate.get(dateKey) || [];
          arr.push({ ...card, listName: list.name });
          byDate.set(dateKey, arr);
        } else {
          noDate.push({ ...card, listName: list.name });
        }
      }
    }

    return { cardsByDate: byDate, unscheduled: noDate };
  }, [board]);

  const weekLabel = `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="flex-1 overflow-hidden flex flex-col pb-20">
      {/* Week navigation */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-cream-dark dark:border-slate-700">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 text-navy/50 dark:text-slate-400 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold font-headline text-navy dark:text-white">{weekLabel}</h2>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs text-electric hover:text-electric/80 font-body transition-colors"
            >
              Today
            </button>
          )}
        </div>

        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 text-navy/50 dark:text-slate-400 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Calendar grid */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-7 min-h-full">
            {days.map((day) => {
              const dateKey = day.toISOString().split('T')[0];
              const dayCards = cardsByDate.get(dateKey) || [];
              const isToday = isSameDay(day, today);
              const isPast = day < today && !isToday;

              return (
                <div
                  key={dateKey}
                  className={`border-r border-b border-cream-dark dark:border-slate-700 min-h-[200px] ${
                    isPast ? 'bg-cream-dark/20 dark:bg-slate-900/30' : ''
                  }`}
                >
                  {/* Day header */}
                  <div className="sticky top-0 px-2 py-2 border-b border-cream-dark dark:border-slate-700 bg-white/80 dark:bg-dark-bg/80 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-navy/40 dark:text-slate-500 font-body uppercase">
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className={`text-sm font-medium font-body ${
                        isToday
                          ? 'w-7 h-7 rounded-full bg-electric text-white flex items-center justify-center'
                          : 'text-navy dark:text-white'
                      }`}>
                        {day.getDate()}
                      </span>
                    </div>
                  </div>

                  {/* Day cards */}
                  <div className="p-1 space-y-1">
                    {dayCards.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => onCardClick(card.card_id)}
                        className={`w-full text-left p-2 rounded-lg border-l-2 bg-white dark:bg-dark-surface hover:shadow-sm transition-all text-xs ${getPriorityColor(card.card?.priority || 'none')}`}
                      >
                        <p className="font-medium text-navy dark:text-white truncate font-body">
                          {card.card?.title || 'Untitled'}
                        </p>
                        <p className="text-navy/40 dark:text-slate-500 font-body mt-0.5 truncate">
                          {card.listName}
                        </p>
                        {card.assignees && card.assignees.length > 0 && (
                          <div className="flex -space-x-1.5 mt-1">
                            {card.assignees.slice(0, 3).map((a) => (
                              <div
                                key={a.id}
                                className="w-5 h-5 rounded-full bg-electric/20 border border-white dark:border-dark-surface flex items-center justify-center"
                                title={a.display_name}
                              >
                                {a.avatar_url ? (
                                  <img src={a.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                  <span className="text-[8px] text-electric font-bold">{a.display_name?.[0]}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unscheduled sidebar */}
        <div className="w-64 border-l border-cream-dark dark:border-slate-700 flex flex-col bg-cream/50 dark:bg-dark-bg/50">
          <div className="px-3 py-2 border-b border-cream-dark dark:border-slate-700">
            <h3 className="text-xs font-semibold text-navy/50 dark:text-slate-400 font-body uppercase tracking-wider">
              Unscheduled ({unscheduled.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {unscheduled.slice(0, 50).map((card) => (
              <button
                key={card.id}
                onClick={() => onCardClick(card.card_id)}
                className="w-full text-left p-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 hover:border-electric/40 dark:hover:border-electric/40 transition-all text-xs"
              >
                <p className="font-medium text-navy dark:text-white truncate font-body">
                  {card.card?.title || 'Untitled'}
                </p>
                <p className="text-navy/40 dark:text-slate-500 font-body mt-0.5 truncate">
                  {card.listName}
                </p>
              </button>
            ))}
            {unscheduled.length > 50 && (
              <p className="text-xs text-center text-navy/40 dark:text-slate-500 py-2 font-body">
                +{unscheduled.length - 50} more
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
