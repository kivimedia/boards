'use client';

import { useState, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import type { BoardWithLists, CardPlacementWithMeta } from '@/lib/types';

interface PlannerViewProps {
  board: BoardWithLists;
  onCardClick: (cardId: string) => void;
  onRefresh?: () => void;
}

type PlannerMode = 'week' | 'month';

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'urgent': return 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10';
    case 'high': return 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10';
    case 'medium': return 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10';
    case 'low': return 'border-l-blue-400 bg-blue-50/50 dark:bg-blue-900/10';
    default: return 'border-l-slate-300 dark:border-l-slate-600';
  }
}

function getPriorityDot(priority: string) {
  switch (priority) {
    case 'urgent': return 'bg-red-500';
    case 'high': return 'bg-orange-500';
    case 'medium': return 'bg-yellow-500';
    case 'low': return 'bg-blue-400';
    default: return 'bg-slate-300 dark:bg-slate-600';
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

function getMonthDays(monthOffset: number): Date[] {
  const today = new Date();
  const targetMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const firstDay = new Date(targetMonth);
  // Go back to previous Sunday
  firstDay.setDate(firstDay.getDate() - firstDay.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(firstDay);
    d.setDate(firstDay.getDate() + i);
    days.push(d);
  }
  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export default function PlannerView({ board, onCardClick, onRefresh }: PlannerViewProps) {
  const [mode, setMode] = useState<PlannerMode>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const today = new Date();

  const days = mode === 'week' ? getWeekDays(weekOffset) : getMonthDays(monthOffset);
  const referenceMonth = mode === 'month'
    ? new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
    : null;

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

  // DnD handler: update card due_date when dropped on a day
  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;

    const destId = destination.droppableId;
    const newDueDate = destId === 'unscheduled' ? null : destId;

    // Find the card ID from the draggableId (which is placement_id)
    let cardId: string | null = null;
    for (const list of board.lists) {
      for (const card of list.cards) {
        if (card.id === draggableId) {
          cardId = card.card_id;
          break;
        }
      }
      if (cardId) break;
    }
    if (!cardId) return;

    try {
      await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: newDueDate }),
      });
      onRefresh?.();
    } catch {
      // ignore
    }
  }, [board, onRefresh]);

  const weekLabel = mode === 'week'
    ? `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : referenceMonth!.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handlePrev = () => mode === 'week' ? setWeekOffset((w) => w - 1) : setMonthOffset((m) => m - 1);
  const handleNext = () => mode === 'week' ? setWeekOffset((w) => w + 1) : setMonthOffset((m) => m + 1);
  const handleToday = () => { setWeekOffset(0); setMonthOffset(0); };
  const isAtToday = mode === 'week' ? weekOffset === 0 : monthOffset === 0;

  return (
    <div className="flex-1 overflow-hidden flex flex-col pb-20">
      {/* Header with navigation + mode toggle */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-cream-dark dark:border-slate-700">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 text-navy/50 dark:text-slate-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 text-navy/50 dark:text-slate-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold font-headline text-navy dark:text-white">{weekLabel}</h2>
          {!isAtToday && (
            <button
              onClick={handleToday}
              className="text-xs text-electric hover:text-electric/80 font-body transition-colors"
            >
              Today
            </button>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-cream-dark/40 dark:bg-slate-800/60 rounded-lg p-0.5">
          <button
            onClick={() => setMode('week')}
            className={`px-3 py-1 text-xs font-body rounded-md transition-all ${
              mode === 'week'
                ? 'bg-white dark:bg-dark-surface text-navy dark:text-white shadow-sm'
                : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setMode('month')}
            className={`px-3 py-1 text-xs font-body rounded-md transition-all ${
              mode === 'month'
                ? 'bg-white dark:bg-dark-surface text-navy dark:text-white shadow-sm'
                : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-hidden flex">
          {/* Calendar grid */}
          <div className="flex-1 overflow-y-auto">
            {/* Day-of-week header row */}
            {mode === 'month' && (
              <div className="grid grid-cols-7 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-dark-bg/50 sticky top-0 z-10">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="px-2 py-1.5 text-center">
                    <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body uppercase">{d}</span>
                  </div>
                ))}
              </div>
            )}

            <div className={`grid grid-cols-7 ${mode === 'month' ? 'auto-rows-[minmax(80px,1fr)]' : 'min-h-full'}`}>
              {days.map((day) => {
                const dateKey = day.toISOString().split('T')[0];
                const dayCards = cardsByDate.get(dateKey) || [];
                const isToday = isSameDay(day, today);
                const isPast = day < today && !isToday;
                const isOutOfMonth = mode === 'month' && referenceMonth && !isSameMonth(day, referenceMonth);

                return (
                  <Droppable droppableId={dateKey} key={dateKey}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`border-r border-b border-cream-dark dark:border-slate-700 ${
                          mode === 'week' ? 'min-h-[200px]' : ''
                        } ${isPast ? 'bg-cream-dark/20 dark:bg-slate-900/30' : ''} ${
                          isOutOfMonth ? 'bg-cream-dark/10 dark:bg-slate-900/20 opacity-50' : ''
                        } ${snapshot.isDraggingOver ? 'bg-electric/5 dark:bg-electric/10 ring-1 ring-inset ring-electric/30' : ''}`}
                      >
                        {/* Day header */}
                        <div className={`sticky top-0 px-2 py-1.5 ${
                          mode === 'week' ? 'border-b border-cream-dark dark:border-slate-700' : ''
                        } bg-white/80 dark:bg-dark-bg/80 backdrop-blur-sm`}>
                          <div className="flex items-center gap-1.5">
                            {mode === 'week' && (
                              <span className="text-xs text-navy/40 dark:text-slate-500 font-body uppercase">
                                {day.toLocaleDateString('en-US', { weekday: 'short' })}
                              </span>
                            )}
                            <span className={`text-xs font-medium font-body ${
                              isToday
                                ? 'w-6 h-6 rounded-full bg-electric text-white flex items-center justify-center text-[11px]'
                                : 'text-navy dark:text-white'
                            }`}>
                              {day.getDate()}
                            </span>
                            {dayCards.length > 0 && (
                              <span className={`text-[9px] font-body px-1 py-0.5 rounded-full ${
                                isPast && !isToday
                                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                  : 'bg-cream-dark/60 dark:bg-slate-800 text-navy/40 dark:text-slate-500'
                              }`}>
                                {dayCards.length}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Day cards */}
                        <div className="p-1 space-y-1">
                          {dayCards.map((card, index) => {
                            const isCardOverdue = isPast && !isToday;
                            return (
                              <Draggable draggableId={card.id} index={index} key={card.id}>
                                {(dragProvided, dragSnapshot) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    onClick={() => onCardClick(card.card_id)}
                                    className={`w-full text-left p-1.5 rounded-lg border-l-2 hover:shadow-sm transition-all cursor-pointer ${
                                      mode === 'month' ? 'text-[10px]' : 'text-xs'
                                    } ${getPriorityColor(card.card?.priority || 'none')} ${
                                      isCardOverdue ? 'opacity-75' : ''
                                    } ${dragSnapshot.isDragging ? 'shadow-lg ring-2 ring-electric/40 z-50' : ''}`}
                                  >
                                    <div className="flex items-start gap-1">
                                      <span className={`w-1.5 h-1.5 rounded-full mt-0.5 flex-shrink-0 ${getPriorityDot(card.card?.priority || 'none')}`} />
                                      <div className="flex-1 min-w-0">
                                        <p className={`font-medium truncate font-body ${
                                          isCardOverdue
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-navy dark:text-white'
                                        }`}>
                                          {card.card?.title || 'Untitled'}
                                        </p>
                                        {mode === 'week' && (
                                          <p className="text-navy/40 dark:text-slate-500 font-body mt-0.5 truncate">
                                            {card.listName}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                );
              })}
            </div>
          </div>

          {/* Unscheduled sidebar */}
          <Droppable droppableId="unscheduled">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`w-64 border-l border-cream-dark dark:border-slate-700 flex flex-col bg-cream/50 dark:bg-dark-bg/50 ${
                  snapshot.isDraggingOver ? 'bg-electric/5 dark:bg-electric/10' : ''
                }`}
              >
                <div className="px-3 py-2 border-b border-cream-dark dark:border-slate-700">
                  <h3 className="text-xs font-semibold text-navy/50 dark:text-slate-400 font-body uppercase tracking-wider">
                    Unscheduled ({unscheduled.length})
                  </h3>
                  <p className="text-[10px] text-navy/30 dark:text-slate-600 font-body mt-0.5">
                    Drag to calendar to schedule
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {unscheduled.slice(0, 50).map((card, index) => (
                    <Draggable draggableId={card.id} index={index} key={card.id}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          onClick={() => onCardClick(card.card_id)}
                          className={`w-full text-left p-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 hover:border-electric/40 dark:hover:border-electric/40 transition-all text-xs cursor-pointer ${
                            dragSnapshot.isDragging ? 'shadow-lg ring-2 ring-electric/40' : ''
                          }`}
                        >
                          <p className="font-medium text-navy dark:text-white truncate font-body">
                            {card.card?.title || 'Untitled'}
                          </p>
                          <p className="text-navy/40 dark:text-slate-500 font-body mt-0.5 truncate">
                            {card.listName}
                          </p>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {unscheduled.length > 50 && (
                    <p className="text-xs text-center text-navy/40 dark:text-slate-500 py-2 font-body">
                      +{unscheduled.length - 50} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>
    </div>
  );
}
