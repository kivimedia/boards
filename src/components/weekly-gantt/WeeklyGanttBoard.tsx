'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WeeklyTask, WeeklyPlanWithTasks } from '@/lib/types';
import { DAY_LABELS, getMonday } from '@/lib/weekly-gantt';
import { DayCard } from './DayCard';
import { WeeklyGanttHeader } from './WeeklyGanttHeader';
import { HistoryPanel } from './HistoryPanel';

interface ClientContact {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
}

interface WeeklyGanttBoardProps {
  clientId: string;
  clientName: string;
  clientContacts?: ClientContact[];
}

export default function WeeklyGanttBoard({
  clientId,
  clientName,
  clientContacts = [],
}: WeeklyGanttBoardProps) {
  const [plan, setPlan] = useState<WeeklyPlanWithTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [showHistory, setShowHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const basePath = `/api/clients/${clientId}/weekly-plans`;

  // ── Fetch plan for current week ─────────────────────────────────────
  const fetchPlan = useCallback(async () => {
    setLoading(true);
    try {
      // Create or get plan for the week
      const createRes = await fetch(basePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart }),
      });
      const created = await createRes.json();
      const planId = created.data?.id;
      if (!planId) return;

      // Fetch full plan with tasks
      const res = await fetch(`${basePath}/${planId}`);
      const json = await res.json();
      if (json.data) setPlan(json.data);
    } finally {
      setLoading(false);
    }
  }, [basePath, weekStart]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // ── Week navigation ────────────────────────────────────────────────
  const goWeek = (delta: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(getMonday(d));
  };

  const goToday = () => setWeekStart(getMonday(new Date()));

  // ── Task CRUD ──────────────────────────────────────────────────────
  const addTask = async (title: string, dayIndex: number = 1) => {
    if (!plan) return;
    const res = await fetch(`${basePath}/${plan.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, day_start: dayIndex, day_end: dayIndex }),
    });
    const json = await res.json();
    if (json.data) {
      setPlan((prev) =>
        prev ? { ...prev, tasks: [...prev.tasks, json.data] } : prev
      );
    }
  };

  const updateTask = async (taskId: string, updates: Partial<WeeklyTask>) => {
    if (!plan) return;

    // Optimistic update
    setPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId ? { ...t, ...updates, completed_at: updates.completed ? new Date().toISOString() : (updates.completed === false ? null : t.completed_at) } : t
        ),
      };
    });

    await fetch(`${basePath}/${plan.id}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  };

  const removeTask = async (taskId: string) => {
    if (!plan) return;
    setPlan((prev) => {
      if (!prev) return prev;
      return { ...prev, tasks: prev.tasks.filter((t) => t.id !== taskId) };
    });
    await fetch(`${basePath}/${plan.id}/tasks/${taskId}`, { method: 'DELETE' });
  };

  // ── Copy from last week ────────────────────────────────────────────
  const copyLastWeek = async () => {
    if (!plan) return;

    const prevMonday = new Date(weekStart);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevWeekStart = getMonday(prevMonday);

    const res = await fetch(`${basePath}?limit=10`);
    const json = await res.json();
    const prevPlan = (json.data ?? []).find(
      (p: { week_start: string }) => p.week_start === prevWeekStart
    );

    if (!prevPlan) {
      alert('No plan found for last week.');
      return;
    }

    await fetch(`${basePath}/${prevPlan.id}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_week_start: weekStart, mode: 'incomplete_only' }),
    });

    fetchPlan();
  };

  // ── Send email ─────────────────────────────────────────────────────
  const sendEmail = async () => {
    if (!plan) return;
    const emails = clientContacts.map((c) => c.email).filter(Boolean);
    if (emails.length === 0) {
      alert('No client contacts with email addresses.');
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${basePath}/${plan.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: emails }),
      });
      const json = await res.json();
      if (json.error) {
        alert(`Email failed: ${json.error}`);
      }
    } finally {
      setSending(false);
    }
  };

  // ── Print ──────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  // ── Snapshot ───────────────────────────────────────────────────────
  const saveSnapshot = async () => {
    if (!plan) return;
    await fetch(`${basePath}/${plan.id}/snapshot`, { method: 'POST' });
  };

  // ── Compute today column ──────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const todayIndex = (() => {
    for (let i = 1; i <= 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + (i - 1));
      if (d.toISOString().split('T')[0] === today) return i;
    }
    return -1;
  })();

  // Build date info for each day
  const dayCards = DAY_LABELS.map((label, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dayIndex = i + 1;

    // Tasks that include this day
    const dayTasks = (plan?.tasks ?? []).filter(
      t => t.day_start <= dayIndex && t.day_end >= dayIndex
    );

    return {
      dayIndex,
      label,
      date: d.getDate(),
      month: d.toLocaleDateString('en-US', { month: 'short' }),
      isToday: dayIndex === todayIndex,
      isWeekend: i >= 5,
      tasks: dayTasks,
    };
  });

  // Weekly summary: all tasks
  const allTasks = plan?.tasks ?? [];
  const weeklyCompleted = allTasks.filter(t => t.completed).length;

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 p-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-cream-dark/40 dark:bg-slate-800/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header toolbar */}
      <WeeklyGanttHeader
        clientName={clientName}
        weekStart={weekStart}
        onPrevWeek={() => goWeek(-1)}
        onNextWeek={() => goWeek(1)}
        onToday={goToday}
        onCopyLastWeek={copyLastWeek}
        onSendEmail={sendEmail}
        onPrint={handlePrint}
        onSaveSnapshot={saveSnapshot}
        onToggleHistory={() => setShowHistory((v) => !v)}
        sending={sending}
        taskCount={plan?.tasks.length ?? 0}
        completedCount={plan?.tasks.filter((t) => t.completed).length ?? 0}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main card grid area */}
        <div ref={printRef} className="flex-1 overflow-auto print:overflow-visible p-4">
          {/* Row 1: Mon - Thu */}
          <div className="grid grid-cols-4 gap-3 mb-3">
            {dayCards.slice(0, 4).map(day => (
              <DayCard
                key={day.dayIndex}
                dayIndex={day.dayIndex}
                dayLabel={day.label}
                date={day.date}
                month={day.month}
                isToday={day.isToday}
                isWeekend={day.isWeekend}
                tasks={day.tasks}
                clientContacts={clientContacts}
                onUpdateTask={updateTask}
                onDeleteTask={removeTask}
                onAddTask={addTask}
              />
            ))}
          </div>

          {/* Row 2: Fri - Sun + Weekly summary */}
          <div className="grid grid-cols-4 gap-3">
            {dayCards.slice(4).map(day => (
              <DayCard
                key={day.dayIndex}
                dayIndex={day.dayIndex}
                dayLabel={day.label}
                date={day.date}
                month={day.month}
                isToday={day.isToday}
                isWeekend={day.isWeekend}
                tasks={day.tasks}
                clientContacts={clientContacts}
                onUpdateTask={updateTask}
                onDeleteTask={removeTask}
                onAddTask={addTask}
              />
            ))}

            {/* Weekly summary card */}
            <div className="flex flex-col rounded-xl border border-electric/30 bg-electric/[0.03] dark:bg-electric/[0.06] min-h-[180px]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-electric/20">
                <span className="text-xs font-semibold font-heading uppercase tracking-wider text-electric">
                  Weekly
                </span>
                {allTasks.length > 0 && (
                  <span className="text-[10px] text-electric/60 font-body font-medium">
                    {weeklyCompleted}/{allTasks.length} done
                  </span>
                )}
              </div>
              <div className="flex-1 px-2 py-1.5 space-y-0.5 overflow-y-auto max-h-[300px]">
                {allTasks.length === 0 ? (
                  <div className="flex items-center justify-center h-full min-h-[120px]">
                    <p className="text-xs text-navy/25 dark:text-slate-600 font-body text-center px-4">
                      Add tasks to any day to see your weekly overview here.
                    </p>
                  </div>
                ) : (
                  allTasks
                    .sort((a, b) => a.day_start - b.day_start || a.sort_order - b.sort_order)
                    .map(task => (
                      <div
                        key={task.id}
                        className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md text-xs font-body ${
                          task.completed ? 'opacity-40' : ''
                        }`}
                      >
                        {/* Color dot */}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          task.color
                            ? (TASK_COLORS_MINI[task.color] || 'bg-electric')
                            : (PRIORITY_COLORS_MINI[task.priority] || 'bg-electric')
                        }`} />

                        {/* Completed check */}
                        {task.completed ? (
                          <svg className="w-3 h-3 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <span className="w-3 h-3 shrink-0" />
                        )}

                        {/* Title */}
                        <span className={`flex-1 truncate min-w-0 ${
                          task.completed ? 'line-through text-navy/25 dark:text-slate-600' : 'text-navy/70 dark:text-slate-300'
                        }`}>
                          {task.title}
                        </span>

                        {/* Day range badge */}
                        <span className="text-[9px] text-navy/30 dark:text-slate-600 shrink-0 font-medium">
                          {DAY_LABELS[task.day_start - 1]}
                          {task.day_end !== task.day_start && `–${DAY_LABELS[task.day_end - 1]}`}
                        </span>

                        {/* Owner initials */}
                        {task.assignee_name && (
                          <span className="w-4 h-4 rounded-full bg-electric/15 text-electric text-[7px] font-bold flex items-center justify-center shrink-0">
                            {task.assignee_name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* History side panel */}
        {showHistory && plan && (
          <HistoryPanel
            planId={plan.id}
            clientId={clientId}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </div>
  );
}

// Mini color maps for the weekly summary card
const TASK_COLORS_MINI: Record<string, string> = {
  blue: 'bg-blue-500', purple: 'bg-purple-500', green: 'bg-green-500',
  orange: 'bg-orange-500', red: 'bg-red-500', pink: 'bg-pink-500',
  teal: 'bg-teal-500', yellow: 'bg-yellow-500',
};

const PRIORITY_COLORS_MINI: Record<string, string> = {
  high: 'bg-orange-400', medium: 'bg-electric', low: 'bg-green-400',
};
