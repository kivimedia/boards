'use client';

import { useState, useEffect, useCallback } from 'react';
import TaskCard from './TaskCard';
import type { MyTask } from '@/lib/my-tasks';
import { groupByBoard, groupByPriority, sortByDueDate } from '@/lib/my-tasks';

type GroupBy = 'board' | 'priority' | 'due_date';

const PAGE_SIZE = 50;

export default function MyTasksContent() {
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('board');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(async (pageNum: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/my-tasks?page=${pageNum}&pageSize=${PAGE_SIZE}`);
      const json = await res.json();
      if (json.data) {
        const result = json.data;
        if (append) {
          setTasks((prev) => [...prev, ...result.tasks]);
        } else {
          setTasks(result.tasks);
        }
        setTotal(result.total);
        setPage(pageNum);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  const hasMore = tasks.length < total;

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchPage(page + 1, true);
    }
  };

  const renderGrouped = () => {
    if (groupBy === 'due_date') {
      const sorted = sortByDueDate(tasks);
      return (
        <div className="space-y-3">
          {sorted.map((task) => (
            <TaskCard key={task.cardId} task={task} />
          ))}
        </div>
      );
    }

    const grouped = groupBy === 'board' ? groupByBoard(tasks) : groupByPriority(tasks);

    return (
      <div className="space-y-8">
        {Object.entries(grouped).map(([key, groupTasks]) => {
          if (groupTasks.length === 0) return null;
          return (
            <div key={key}>
              <h2 className="text-sm font-semibold text-navy/70 dark:text-white/70 uppercase tracking-wider mb-3">
                {key} <span className="text-navy/40 dark:text-white/40 font-normal">({groupTasks.length})</span>
              </h2>
              <div className="space-y-3">
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
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-navy p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <p className="text-navy/60 dark:text-white/60 font-body text-sm">
            {total > 0
              ? `Showing ${tasks.length} of ${total} assigned tasks.`
              : 'Your assigned tasks across all boards.'}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-navy/40 dark:text-white/40 font-medium">Group by:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="text-sm bg-white dark:bg-navy-light border-2 border-cream-dark dark:border-slate-700 rounded-xl px-3 py-1.5 text-navy dark:text-white focus:outline-none focus:border-electric transition-colors"
            >
              <option value="board">Board</option>
              <option value="priority">Priority</option>
              <option value="due_date">Due Date</option>
            </select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-electric border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-electric/10 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3 className="text-navy dark:text-white font-heading font-semibold mb-1">No tasks assigned</h3>
            <p className="text-navy/50 dark:text-white/50 text-sm">You don&apos;t have any tasks assigned to you right now.</p>
          </div>
        ) : (
          <>
            {renderGrouped()}

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 bg-white dark:bg-navy-light border-2 border-cream-dark dark:border-slate-700 rounded-xl text-sm font-semibold text-navy dark:text-white hover:border-electric dark:hover:border-electric transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-electric border-t-transparent rounded-full animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    `Load more (${total - tasks.length} remaining)`
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
