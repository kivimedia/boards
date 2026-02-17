'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GanttTask } from '@/lib/types';
import { useChartColors } from '@/hooks/useChartColors';

interface GanttViewProps {
  boardId: string;
}

function priorityColor(priority: string | null): string {
  switch (priority) {
    case 'urgent': return 'bg-red-500';
    case 'high': return 'bg-orange-400';
    case 'medium': return 'bg-yellow-400';
    case 'low': return 'bg-green-400';
    default: return 'bg-electric';
  }
}

function priorityBarColor(priority: string | null): string {
  switch (priority) {
    case 'urgent': return '#ef4444';
    case 'high': return '#fb923c';
    case 'medium': return '#facc15';
    case 'low': return '#4ade80';
    default: return '#6366f1';
  }
}

function daysBetween(a: string, b: string): number {
  return Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

export default function GanttView({ boardId }: GanttViewProps) {
  const colors = useChartColors();
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/boards/${boardId}/gantt`);
      const json = await res.json();
      if (json.data) setTasks(json.data);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Compute timeline range
  const { timelineStart, timelineDays, dayWidth } = useMemo(() => {
    const datesWithValues = tasks.filter((t) => t.start_date || t.end_date);
    if (datesWithValues.length === 0) {
      const now = new Date();
      return {
        timelineStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
        timelineDays: 30,
        dayWidth: 28,
      };
    }

    const allDates: string[] = [];
    for (const t of tasks) {
      if (t.start_date) allDates.push(t.start_date);
      if (t.end_date) allDates.push(t.end_date);
    }
    allDates.sort();

    const start = new Date(allDates[0]);
    start.setDate(start.getDate() - 2);
    const end = new Date(allDates[allDates.length - 1]);
    end.setDate(end.getDate() + 3);

    const days = daysBetween(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
    return {
      timelineStart: start.toISOString().split('T')[0],
      timelineDays: Math.max(days, 14),
      dayWidth: 28,
    };
  }, [tasks]);

  // Build date column headers
  const dateHeaders = useMemo(() => {
    const headers: { date: string; label: string; isWeekend: boolean }[] = [];
    const start = new Date(timelineStart);
    for (let i = 0; i < timelineDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dayOfWeek = d.getDay();
      headers.push({
        date: d.toISOString().split('T')[0],
        label: `${d.getDate()}`,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      });
    }
    return headers;
  }, [timelineStart, timelineDays]);

  // Build dependency lines
  const depLines = useMemo(() => {
    const taskMap = new Map(tasks.map((t) => [t.card_id, t]));
    const lines: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];

    tasks.forEach((task, taskIndex) => {
      for (const depId of task.dependencies) {
        const depTask = taskMap.get(depId);
        if (!depTask) continue;
        const depIndex = tasks.findIndex((t) => t.card_id === depId);
        if (depIndex === -1) continue;

        const depEnd = depTask.end_date ?? depTask.start_date;
        const taskStart = task.start_date ?? task.end_date;
        if (!depEnd || !taskStart) continue;

        const fromDay = daysBetween(timelineStart, depEnd);
        const toDay = daysBetween(timelineStart, taskStart);

        lines.push({
          from: { x: fromDay * dayWidth, y: depIndex * 48 + 24 },
          to: { x: toDay * dayWidth, y: taskIndex * 48 + 24 },
        });
      }
    });

    return lines;
  }, [tasks, timelineStart, dayWidth]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 p-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-cream-dark/40 dark:bg-slate-800/40" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
          No tasks with dates found. Add start/end dates to cards to see them on the Gantt chart.
        </p>
      </div>
    );
  }

  const totalWidth = timelineDays * dayWidth;
  const leftPanelWidth = 240;

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex min-w-fit">
        {/* Left panel - task names */}
        <div className="shrink-0 border-r border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface z-10" style={{ width: leftPanelWidth }}>
          <div className="h-10 border-b border-cream-dark dark:border-slate-700 px-3 flex items-center">
            <span className="text-xs font-semibold text-navy/50 dark:text-slate-400 font-heading uppercase tracking-wider">
              Task
            </span>
          </div>
          {tasks.map((task) => (
            <div
              key={task.id}
              className="h-12 border-b border-cream-dark/50 dark:border-slate-700/50 px-3 flex items-center gap-2"
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${priorityColor(task.priority)}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-navy dark:text-slate-100 font-body truncate" title={task.title}>
                  {task.title}
                </p>
                <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body truncate">{task.list_name}</p>
              </div>
              {task.assignees.length > 0 && (
                <div className="flex -space-x-1 ml-auto shrink-0">
                  {task.assignees.slice(0, 2).map((a, i) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded-full bg-electric/20 text-electric border border-white flex items-center justify-center text-[8px] font-bold font-body"
                      title={a}
                    >
                      {a.slice(0, 2).toUpperCase()}
                    </div>
                  ))}
                  {task.assignees.length > 2 && (
                    <div className="w-5 h-5 rounded-full bg-cream-dark dark:bg-slate-700 text-navy/40 dark:text-slate-400 border border-white dark:border-dark-surface flex items-center justify-center text-[8px] font-body">
                      +{task.assignees.length - 2}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right panel - timeline */}
        <div className="flex-1 overflow-x-auto">
          {/* Date headers */}
          <div className="flex h-10 border-b border-cream-dark dark:border-slate-700">
            {dateHeaders.map((header) => (
              <div
                key={header.date}
                className={`shrink-0 flex items-center justify-center border-r border-cream-dark/30 dark:border-slate-700/30 text-[10px] font-body ${
                  header.isWeekend ? 'bg-cream/60 dark:bg-navy/40 text-navy/30 dark:text-slate-600' : 'bg-white dark:bg-dark-surface text-navy/50 dark:text-slate-400'
                }`}
                style={{ width: dayWidth }}
              >
                {header.label}
              </div>
            ))}
          </div>

          {/* Task bars */}
          <div className="relative" style={{ width: totalWidth }}>
            {/* Dependency lines (SVG overlay) */}
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: totalWidth, height: tasks.length * 48 }}
            >
              {depLines.map((line, i) => (
                <path
                  key={i}
                  d={`M ${line.from.x} ${line.from.y} C ${line.from.x + 20} ${line.from.y}, ${line.to.x - 20} ${line.to.y}, ${line.to.x} ${line.to.y}`}
                  fill="none"
                  stroke={colors.depLine}
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  opacity={0.4}
                  markerEnd="url(#arrowhead)"
                />
              ))}
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 Z" fill={colors.depLine} opacity={0.4} />
                </marker>
              </defs>
            </svg>

            {/* Task rows */}
            {tasks.map((task) => {
              const startDay = task.start_date
                ? daysBetween(timelineStart, task.start_date)
                : task.end_date
                ? daysBetween(timelineStart, task.end_date) - 1
                : 0;

              const duration = task.start_date && task.end_date
                ? daysBetween(task.start_date, task.end_date)
                : 1;

              const barLeft = startDay * dayWidth;
              const barWidth = Math.max(duration * dayWidth, dayWidth);
              const progressWidth = barWidth * (task.progress_percent / 100);
              const color = priorityBarColor(task.priority);

              return (
                <div
                  key={task.id}
                  className="h-12 border-b border-cream-dark/30 dark:border-slate-700/30 relative flex items-center"
                >
                  {/* Weekend stripes */}
                  {dateHeaders.map((header, hi) => (
                    header.isWeekend && (
                      <div
                        key={hi}
                        className="absolute top-0 bottom-0 bg-cream/40 dark:bg-navy/30"
                        style={{ left: hi * dayWidth, width: dayWidth }}
                      />
                    )
                  ))}

                  {/* Bar */}
                  {(task.start_date || task.end_date) && (
                    <div
                      className="absolute h-7 rounded-md border border-navy/5 overflow-hidden group cursor-pointer"
                      style={{
                        left: barLeft,
                        width: barWidth,
                        backgroundColor: `${color}22`,
                      }}
                      title={`${task.title} (${task.progress_percent}%)`}
                    >
                      {/* Progress fill */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-l-md"
                        style={{
                          width: progressWidth,
                          backgroundColor: color,
                          opacity: 0.6,
                        }}
                      />
                      {/* Label */}
                      <span className="relative z-10 text-[10px] font-medium text-navy/70 dark:text-slate-300 font-body px-2 py-1 truncate block">
                        {task.title}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
