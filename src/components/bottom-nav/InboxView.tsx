'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface InboxItem {
  placementId: string;
  cardId: string;
  title: string;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  listName: string;
  listId: string;
  boardId: string;
  boardName: string;
  boardType: string;
}

interface InboxViewProps {
  currentBoardId: string;
  onCardClick: (cardId: string) => void;
}

type PriorityFilter = 'all' | 'urgent' | 'high' | 'medium' | 'low';
type DueFilter = 'all' | 'overdue' | 'today' | 'this_week' | 'no_date';

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'urgent': return 'bg-red-500';
    case 'high': return 'bg-orange-500';
    case 'medium': return 'bg-yellow-500';
    case 'low': return 'bg-blue-400';
    default: return 'bg-slate-300 dark:bg-slate-600';
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

function isNew(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return now.getTime() - d.getTime() < 24 * 60 * 60 * 1000;
}

function isOverdue(dueDate: string): boolean {
  const d = new Date(dueDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return d < now;
}

function isDueToday(dueDate: string): boolean {
  const d = new Date(dueDate);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isDueThisWeek(dueDate: string): boolean {
  const d = new Date(dueDate);
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + (7 - now.getDay()));
  weekEnd.setHours(23, 59, 59, 999);
  return d >= now && d <= weekEnd;
}

const PRIORITY_FILTERS: { value: PriorityFilter; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: '' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'low', label: 'Low', color: 'bg-blue-400' },
];

const DUE_FILTERS: { value: DueFilter; label: string }[] = [
  { value: 'all', label: 'Any date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'this_week', label: 'This week' },
  { value: 'no_date', label: 'No date' },
];

export default function InboxView({ currentBoardId, onCardClick }: InboxViewProps) {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');

  // Fetch cross-board inbox items
  useEffect(() => {
    let cancelled = false;
    const fetchInbox = async () => {
      try {
        const res = await fetch('/api/inbox');
        if (!res.ok) { if (!cancelled) setLoading(false); return; }
        const { data } = await res.json();
        if (!cancelled && data) setItems(data);
      } catch {
        // ignore
      }
      if (!cancelled) setLoading(false);
    };
    fetchInbox();
    return () => { cancelled = true; };
  }, []);

  // Apply filters
  const filtered = useMemo(() => {
    let result = items;
    if (priorityFilter !== 'all') {
      result = result.filter((c) => c.priority === priorityFilter);
    }
    if (dueFilter !== 'all') {
      result = result.filter((c) => {
        switch (dueFilter) {
          case 'overdue': return c.dueDate && isOverdue(c.dueDate);
          case 'today': return c.dueDate && isDueToday(c.dueDate);
          case 'this_week': return c.dueDate && isDueThisWeek(c.dueDate);
          case 'no_date': return !c.dueDate;
          default: return true;
        }
      });
    }
    return result;
  }, [items, priorityFilter, dueFilter]);

  // Group by board
  const grouped = useMemo(() => {
    const map = new Map<string, { boardName: string; boardType: string; items: InboxItem[] }>();
    for (const item of filtered) {
      const existing = map.get(item.boardId);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.boardId, { boardName: item.boardName, boardType: item.boardType, items: [item] });
      }
    }
    return Array.from(map.entries());
  }, [filtered]);

  const hasFilters = priorityFilter !== 'all' || dueFilter !== 'all';

  // Quick action: Claim (assign to self)
  const handleClaim = useCallback(async (e: React.MouseEvent, cardId: string) => {
    e.stopPropagation();
    setActionLoading(cardId);
    try {
      await fetch(`/api/cards/${cardId}/assignees`, { method: 'POST' });
      setItems((prev) => prev.filter((i) => i.cardId !== cardId));
    } catch {
      // ignore
    }
    setActionLoading(null);
  }, []);

  // Quick action: Snooze (set due_date to tomorrow)
  const handleSnooze = useCallback(async (e: React.MouseEvent, cardId: string) => {
    e.stopPropagation();
    setActionLoading(cardId);
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: dateStr }),
      });
      setItems((prev) => prev.map((i) =>
        i.cardId === cardId ? { ...i, dueDate: dateStr } : i
      ));
    } catch {
      // ignore
    }
    setActionLoading(null);
  }, []);

  const handleCardClick = useCallback((item: InboxItem) => {
    if (item.boardId === currentBoardId) {
      onCardClick(item.cardId);
    } else {
      router.push(`/board/${item.boardId}?card=${item.cardId}`);
    }
  }, [currentBoardId, onCardClick, router]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center pb-24">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-400">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-body text-sm">Loading inbox...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-6 pb-24">
      <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-electric/10 dark:bg-electric/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold font-headline text-navy dark:text-white">Inbox</h2>
            <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
              {filtered.length}{hasFilters ? ` of ${items.length}` : ''} unassigned {filtered.length === 1 ? 'item' : 'items'} across all boards
            </p>
          </div>
        </div>

        {/* Filter pills */}
        <div className="space-y-3 mb-5">
          {/* Priority filters */}
          <div className="flex items-start gap-2">
            <span className="text-[10px] uppercase tracking-wider text-navy/30 dark:text-slate-600 font-body pt-1 shrink-0">Priority</span>
            <div className="flex flex-wrap gap-1.5 min-w-0">
              {PRIORITY_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setPriorityFilter(f.value === priorityFilter ? 'all' : f.value)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-body transition-all shrink-0 ${
                    priorityFilter === f.value
                      ? 'bg-electric text-white shadow-sm'
                      : 'bg-cream-dark/40 dark:bg-slate-800/60 text-navy/50 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800'
                  }`}
                >
                  {f.color && <span className={`w-2 h-2 rounded-full ${f.color}`} />}
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due date filters */}
          <div className="flex items-start gap-2">
            <span className="text-[10px] uppercase tracking-wider text-navy/30 dark:text-slate-600 font-body pt-1 shrink-0">Due</span>
            <div className="flex flex-wrap gap-1.5 min-w-0">
              {DUE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setDueFilter(f.value === dueFilter ? 'all' : f.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-body transition-all shrink-0 whitespace-nowrap ${
                    dueFilter === f.value
                      ? 'bg-electric text-white shadow-sm'
                      : f.value === 'overdue' && dueFilter !== f.value
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
                      : 'bg-cream-dark/40 dark:bg-slate-800/60 text-navy/50 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-navy/60 dark:text-slate-400 font-body text-sm">
              {hasFilters ? 'No items match current filters.' : 'All items are assigned. Inbox is clear!'}
            </p>
            {hasFilters && (
              <button
                onClick={() => { setPriorityFilter('all'); setDueFilter('all'); }}
                className="mt-2 text-xs text-electric hover:text-electric/80 font-body transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([boardId, group]) => (
              <div key={boardId}>
                {/* Board group header */}
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                    style={{ backgroundColor: boardId === currentBoardId ? '#6366f1' : '#94a3b8' }}
                  >
                    {group.boardName[0]?.toUpperCase()}
                  </div>
                  <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-body">
                    {group.boardName}
                  </h3>
                  <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body">
                    {group.items.length}
                  </span>
                  {boardId === currentBoardId && (
                    <span className="text-[10px] text-electric font-body font-medium">Current</span>
                  )}
                </div>

                {/* Cards in this board */}
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const isNewItem = isNew(item.createdAt);
                    const isLoading = actionLoading === item.cardId;

                    return (
                      <div
                        key={item.placementId}
                        onClick={() => handleCardClick(item)}
                        className={`w-full text-left p-3 sm:p-4 bg-white dark:bg-dark-surface border rounded-xl hover:border-electric/40 dark:hover:border-electric/40 hover:shadow-sm transition-all group cursor-pointer overflow-hidden ${
                          isNewItem
                            ? 'border-electric/30 dark:border-electric/20 ring-1 ring-electric/10'
                            : 'border-cream-dark dark:border-slate-700'
                        } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Priority dot */}
                          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${getPriorityColor(item.priority)}`} />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-sm font-medium text-navy dark:text-white truncate group-hover:text-electric transition-colors font-body">
                                {item.title}
                              </h3>
                              {isNewItem && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-electric/10 text-electric rounded-md font-body">
                                  New
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-navy/40 dark:text-slate-500 font-body flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-cream-dark/50 dark:bg-slate-800 rounded-md max-w-[180px] truncate">
                                {item.listName}
                              </span>
                              <span className="shrink-0">{timeAgo(item.createdAt)}</span>
                            </div>

                            {/* Quick actions */}
                            <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                              <button
                                onClick={(e) => handleClaim(e, item.cardId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-body rounded-lg bg-electric/10 text-electric hover:bg-electric/20 transition-colors shrink-0"
                                title="Assign to me"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                Claim
                              </button>
                              <button
                                onClick={(e) => handleSnooze(e, item.cardId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-body rounded-lg bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/30 transition-colors shrink-0"
                                title="Snooze to tomorrow"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Snooze
                              </button>
                            </div>
                          </div>

                          {/* Due date badge */}
                          {item.dueDate && (
                            <span className={`text-xs px-2 py-1 rounded-lg font-body flex-shrink-0 ${
                              isOverdue(item.dueDate)
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : isDueToday(item.dueDate)
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-cream-dark/50 dark:bg-slate-800 text-navy/50 dark:text-slate-400'
                            }`}>
                              {isOverdue(item.dueDate) && (
                                <span className="mr-1">!</span>
                              )}
                              {new Date(item.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}

                          {/* Cross-board indicator */}
                          {item.boardId !== currentBoardId && (
                            <svg className="w-4 h-4 text-navy/20 dark:text-slate-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
