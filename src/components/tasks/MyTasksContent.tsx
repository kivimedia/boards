'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import TaskCard from './TaskCard';
import TaskStats from './TaskStats';
import type { MyTask } from '@/lib/my-tasks';
import { groupByBoard, groupByPriority, groupByUrgency } from '@/lib/my-tasks';

type GroupBy = 'urgency' | 'board' | 'priority';
type StatusFilter = 'overdue' | 'due_soon' | 'no_date' | null;

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'No Priority' },
];

export default function MyTasksContent() {
  const [allTasks, setAllTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('urgency');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterBoard, setFilterBoard] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/my-tasks?page=1&pageSize=500');
      const json = await res.json();
      if (json.data) {
        setAllTasks(json.data.tasks);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Derive unique board names for filter dropdown
  const boardNames = useMemo(() => {
    const names = new Set<string>();
    for (const t of allTasks) names.add(t.boardName);
    return Array.from(names).sort();
  }, [allTasks]);

  // Apply filters
  const filteredTasks = useMemo(() => {
    let result = allTasks;

    if (filterPriority) {
      result = result.filter((t) => t.priority === filterPriority);
    }
    if (filterBoard) {
      result = result.filter((t) => t.boardName === filterBoard);
    }
    if (filterStatus === 'overdue') {
      result = result.filter((t) => t.isOverdue);
    } else if (filterStatus === 'due_soon') {
      result = result.filter((t) => t.isDueSoon);
    } else if (filterStatus === 'no_date') {
      result = result.filter((t) => !t.dueDate);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.boardName.toLowerCase().includes(q) ||
        t.listName.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allTasks, filterPriority, filterBoard, filterStatus, searchQuery]);

  const activeFilterCount = [filterPriority, filterBoard, filterStatus, searchQuery.trim()].filter(Boolean).length;

  const clearFilters = () => {
    setFilterPriority('');
    setFilterBoard('');
    setFilterStatus(null);
    setSearchQuery('');
  };

  const renderGrouped = () => {
    if (groupBy === 'urgency') {
      const groups = groupByUrgency(filteredTasks);
      return (
        <div className="space-y-8">
          {groups.map((group) => {
            if (group.tasks.length === 0) return null;
            return (
              <div key={group.label}>
                <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${group.accent}`}>
                  {group.label}{' '}
                  <span className="text-navy/30 dark:text-white/30 font-normal">({group.tasks.length})</span>
                </h2>
                <div className="space-y-2">
                  {group.tasks.map((task) => (
                    <TaskCard key={task.cardId} task={task} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    const grouped = groupBy === 'board' ? groupByBoard(filteredTasks) : groupByPriority(filteredTasks);

    return (
      <div className="space-y-8">
        {Object.entries(grouped).map(([key, groupTasks]) => {
          if (groupTasks.length === 0) return null;
          return (
            <div key={key}>
              <h2 className="text-sm font-semibold text-navy/70 dark:text-white/70 uppercase tracking-wider mb-3">
                {key} <span className="text-navy/30 dark:text-white/30 font-normal">({groupTasks.length})</span>
              </h2>
              <div className="space-y-2">
                {groupTasks.map((task) => (
                  <TaskCard key={task.cardId} task={task} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Stats Banner */}
        {!loading && allTasks.length > 0 && (
          <div className="mb-6">
            <TaskStats
              tasks={allTasks}
              activeFilter={filterStatus}
              onFilterChange={setFilterStatus}
            />
          </div>
        )}

        {/* Filter Bar */}
        {!loading && allTasks.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/30 dark:text-white/30">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-dark-surface border-2 border-cream-dark dark:border-slate-700 rounded-xl text-navy dark:text-white placeholder:text-navy/30 dark:placeholder:text-white/30 focus:outline-none focus:border-electric transition-colors"
              />
            </div>

            {/* Priority filter */}
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="text-sm bg-white dark:bg-dark-surface border-2 border-cream-dark dark:border-slate-700 rounded-xl px-3 py-2 text-navy dark:text-white focus:outline-none focus:border-electric transition-colors"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Board filter */}
            <select
              value={filterBoard}
              onChange={(e) => setFilterBoard(e.target.value)}
              className="text-sm bg-white dark:bg-dark-surface border-2 border-cream-dark dark:border-slate-700 rounded-xl px-3 py-2 text-navy dark:text-white focus:outline-none focus:border-electric transition-colors"
            >
              <option value="">All Boards</option>
              {boardNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            {/* Group by */}
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="text-sm bg-white dark:bg-dark-surface border-2 border-cream-dark dark:border-slate-700 rounded-xl px-3 py-2 text-navy dark:text-white focus:outline-none focus:border-electric transition-colors"
            >
              <option value="urgency">Group: Urgency</option>
              <option value="board">Group: Board</option>
              <option value="priority">Group: Priority</option>
            </select>

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-electric hover:text-electric/80 font-semibold transition-colors"
              >
                Clear filters ({activeFilterCount})
              </button>
            )}
          </div>
        )}

        {/* Results count */}
        {!loading && allTasks.length > 0 && filteredTasks.length !== allTasks.length && (
          <p className="text-xs text-navy/40 dark:text-white/40 mb-4">
            Showing {filteredTasks.length} of {allTasks.length} tasks
          </p>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-electric border-t-transparent rounded-full animate-spin" />
          </div>
        ) : allTasks.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-electric/10 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3 className="text-navy dark:text-white font-heading font-semibold mb-1">No tasks assigned</h3>
            <p className="text-navy/50 dark:text-white/50 text-sm">
              Tasks assigned to you on any board will appear here.
            </p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-navy/50 dark:text-white/50 text-sm">
              No tasks match your filters.
            </p>
            <button
              onClick={clearFilters}
              className="mt-2 text-sm text-electric hover:text-electric/80 font-semibold transition-colors"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          renderGrouped()
        )}
      </div>
    </div>
  );
}
