'use client';

import { useState, useMemo } from 'react';
import type { ListWithCards, CardPriority } from '@/lib/types';

interface CalendarViewProps {
  lists: ListWithCards[];
}

interface CalendarCard {
  id: string;
  title: string;
  listName: string;
  priority: CardPriority;
  due_date: string;
}

function priorityDot(priority: CardPriority): string {
  switch (priority) {
    case 'urgent': return 'bg-red-500';
    case 'high': return 'bg-orange-500';
    case 'medium': return 'bg-yellow-500';
    case 'low': return 'bg-green-500';
    default: return 'bg-gray-300';
  }
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarView({ lists }: CalendarViewProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const cardsWithDates: CalendarCard[] = useMemo(() => {
    const cards: CalendarCard[] = [];
    for (const list of lists) {
      for (const placement of list.cards) {
        if (placement.card.due_date) {
          cards.push({
            id: placement.card.id,
            title: placement.card.title,
            listName: list.name,
            priority: placement.card.priority,
            due_date: placement.card.due_date,
          });
        }
      }
    }
    return cards;
  }, [lists]);

  // Group cards by date key (YYYY-MM-DD)
  const cardsByDate = useMemo(() => {
    const map: Record<string, CalendarCard[]> = {};
    for (const card of cardsWithDates) {
      const dateKey = card.due_date.split('T')[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(card);
    }
    return map;
  }, [cardsWithDates]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  // Build calendar grid cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to fill last row
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm dark:shadow-none overflow-hidden">
        {/* Calendar header */}
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading min-w-[160px] text-center">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h3>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-cream-dark dark:bg-slate-700 hover:bg-cream-dark/80 dark:hover:bg-slate-600 text-navy dark:text-slate-100 transition-all"
          >
            Today
          </button>
        </div>

        {/* Day names header */}
        <div className="hidden sm:grid grid-cols-7 border-b border-cream-dark dark:border-slate-700">
          {DAY_NAMES.map((day) => (
            <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid (hidden on mobile, replaced by list) */}
        <div className="hidden sm:grid grid-cols-7">
          {cells.map((day, idx) => {
            if (day === null) {
              return (
                <div key={`empty-${idx}`} className="min-h-[100px] border-b border-r border-cream-dark/50 dark:border-slate-700/50 bg-cream/20 dark:bg-navy/20" />
              );
            }

            const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayCards = cardsByDate[dateKey] ?? [];
            const isToday = dateKey === todayKey;

            return (
              <div
                key={dateKey}
                className={`min-h-[100px] border-b border-r border-cream-dark/50 dark:border-slate-700/50 p-1.5 ${isToday ? 'bg-electric/5' : 'bg-white dark:bg-dark-surface'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`
                      inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium font-body
                      ${isToday
                        ? 'bg-electric text-white'
                        : 'text-navy/60 dark:text-slate-400'
                      }
                    `}
                  >
                    {day}
                  </span>
                  {dayCards.length > 0 && (
                    <span className="text-xs text-navy/30 font-body">{dayCards.length}</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayCards.slice(0, 3).map((card) => (
                    <button
                      key={card.id}
                      onClick={() => setSelectedCardId(card.id === selectedCardId ? null : card.id)}
                      className={`
                        w-full text-left px-1.5 py-0.5 rounded text-xs font-body truncate transition-all
                        ${selectedCardId === card.id
                          ? 'bg-electric/20 text-electric ring-1 ring-electric/30'
                          : 'bg-cream-dark/40 dark:bg-slate-800/40 text-navy/70 dark:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 hover:text-navy dark:hover:text-white'
                        }
                      `}
                      title={`${card.title} (${card.listName})`}
                    >
                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${priorityDot(card.priority)}`} />
                      {card.title}
                    </button>
                  ))}
                  {dayCards.length > 3 && (
                    <p className="text-xs text-navy/30 font-body px-1.5">
                      +{dayCards.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile list view */}
        <div className="sm:hidden divide-y divide-cream-dark/50 dark:divide-slate-700/50">
          {(() => {
            const allDayEntries: { dateKey: string; day: number; cards: CalendarCard[] }[] = [];
            for (let d = 1; d <= daysInMonth; d++) {
              const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dayCards = cardsByDate[dateKey] ?? [];
              if (dayCards.length > 0) {
                allDayEntries.push({ dateKey, day: d, cards: dayCards });
              }
            }
            if (allDayEntries.length === 0) {
              return (
                <div className="py-8 text-center">
                  <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No cards with due dates this month.</p>
                </div>
              );
            }
            return allDayEntries.map(({ dateKey, day, cards: dayCards }) => {
              const isToday = dateKey === todayKey;
              return (
                <div key={dateKey} className={`px-4 py-3 ${isToday ? 'bg-electric/5' : ''}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium font-body ${isToday ? 'bg-electric text-white' : 'text-navy/60 dark:text-slate-400 bg-cream-dark dark:bg-slate-700'}`}>
                      {day}
                    </span>
                    <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                      {DAY_NAMES[new Date(currentYear, currentMonth, day).getDay()]}
                    </span>
                  </div>
                  <div className="space-y-1 pl-9">
                    {dayCards.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => setSelectedCardId(card.id === selectedCardId ? null : card.id)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm font-body transition-all ${
                          selectedCardId === card.id
                            ? 'bg-electric/20 text-electric ring-1 ring-electric/30'
                            : 'bg-cream-dark/40 dark:bg-slate-800/40 text-navy/70 dark:text-slate-300'
                        }`}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${priorityDot(card.priority)}`} />
                        {card.title}
                        <span className="text-xs text-navy/30 dark:text-slate-500 ml-1.5">{card.listName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Selected card detail panel */}
      {selectedCardId && (() => {
        const card = cardsWithDates.find((c) => c.id === selectedCardId);
        if (!card) return null;
        return (
          <div className="mt-4 p-4 rounded-xl border border-electric/20 bg-electric/5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">{card.title}</h4>
                <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5">
                  {card.listName} &middot; Due {new Date(card.due_date).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedCardId(null)}
                className="text-navy/40 hover:text-navy transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
