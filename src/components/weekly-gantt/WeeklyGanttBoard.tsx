'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WeeklyTask, WeeklyPlanWithTasks, Profile } from '@/lib/types';
import { DAY_LABELS, getMonday } from '@/lib/weekly-gantt';
import { TaskRow } from './TaskRow';
import { AddTaskRow } from './AddTaskRow';
import { WeeklyGanttHeader } from './WeeklyGanttHeader';
import { HistoryPanel } from './HistoryPanel';

interface WeeklyGanttBoardProps {
  clientId: string;
  clientName: string;
  clientContacts?: { email: string; name: string }[];
  teamMembers: Profile[];
}

export default function WeeklyGanttBoard({
  clientId,
  clientName,
  clientContacts = [],
  teamMembers,
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
  const addTask = async (title: string) => {
    if (!plan) return;
    const res = await fetch(`${basePath}/${plan.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, day_start: 1, day_end: 1 }),
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

    // Get the previous week's plan
    const prevMonday = new Date(weekStart);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevWeekStart = getMonday(prevMonday);

    // Find previous plan
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

  // Date labels for the header
  const dateCells = DAY_LABELS.map((label, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return {
      label,
      date: d.getDate(),
      month: d.toLocaleDateString('en-US', { month: 'short' }),
      isToday: i + 1 === todayIndex,
      isWeekend: i >= 5,
    };
  });

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
        {/* Main gantt area */}
        <div ref={printRef} className="flex-1 overflow-auto print:overflow-visible">
          {/* Day column headers */}
          <div className="sticky top-0 z-10 bg-white dark:bg-dark-surface border-b border-cream-dark dark:border-slate-700">
            <div className="grid grid-cols-[minmax(200px,2fr)_100px_repeat(7,1fr)_40px] items-center">
              <div className="px-4 py-2">
                <span className="text-xs font-semibold text-navy/50 dark:text-slate-400 font-heading uppercase tracking-wider">
                  Task
                </span>
              </div>
              <div className="px-2 py-2">
                <span className="text-xs font-semibold text-navy/50 dark:text-slate-400 font-heading uppercase tracking-wider">
                  Owner
                </span>
              </div>
              {dateCells.map((cell, i) => (
                <div
                  key={i}
                  className={`px-1 py-2 text-center ${
                    cell.isToday
                      ? 'bg-electric/10 dark:bg-electric/20 rounded-t-lg'
                      : cell.isWeekend
                        ? 'bg-cream/60 dark:bg-navy/30'
                        : ''
                  }`}
                >
                  <span className={`text-[10px] block font-body ${
                    cell.isToday ? 'text-electric font-bold' : 'text-navy/40 dark:text-slate-500'
                  }`}>
                    {cell.label}
                  </span>
                  <span className={`text-xs font-medium font-body ${
                    cell.isToday ? 'text-electric' : 'text-navy/60 dark:text-slate-400'
                  }`}>
                    {cell.date}
                  </span>
                </div>
              ))}
              <div /> {/* Actions column */}
            </div>
          </div>

          {/* Task rows */}
          <div>
            {plan?.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                todayIndex={todayIndex}
                teamMembers={teamMembers}
                onUpdate={(updates) => updateTask(task.id, updates)}
                onDelete={() => removeTask(task.id)}
                planId={plan.id}
                clientId={clientId}
              />
            ))}

            {/* Add new task row */}
            <AddTaskRow onAdd={addTask} />
          </div>

          {/* Empty state */}
          {plan && plan.tasks.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
                No tasks yet. Add your first task above or copy from last week.
              </p>
            </div>
          )}
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
