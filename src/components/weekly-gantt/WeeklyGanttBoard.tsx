'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import type { WeeklyTask, WeeklyPlanWithTasks, ClientTeamMember } from '@/lib/types';
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
  clientCompany?: string | null;
  clientContacts?: ClientContact[];
  teamMembers?: ClientTeamMember[];
}

export default function WeeklyGanttBoard({
  clientId,
  clientName,
  clientCompany,
  clientContacts = [],
  teamMembers = [],
}: WeeklyGanttBoardProps) {
  const [plan, setPlan] = useState<WeeklyPlanWithTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [showHistory, setShowHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState('');
  const [isClientView, setIsClientView] = useState(false);
  const [viewMode, setViewMode] = useState<'1week' | '4weeks'>('1week');
  const [fourWeekPlans, setFourWeekPlans] = useState<(WeeklyPlanWithTasks | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  // Week cache for fast navigation
  const weekCache = useRef<Map<string, WeeklyPlanWithTasks>>(new Map());

  const basePath = `/api/clients/${clientId}/weekly-plans`;
  const displayName = clientCompany || clientName;

  // -- Fetch plan for a given week (with caching) --
  const fetchWeekPlan = useCallback(async (ws: string, skipLoading = false): Promise<WeeklyPlanWithTasks | null> => {
    // Return cached if available
    const cached = weekCache.current.get(ws);
    if (cached && skipLoading) return cached;

    try {
      const createRes = await fetch(basePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: ws }),
      });
      const created = await createRes.json();
      const planId = created.data?.id;
      if (!planId) return null;

      const res = await fetch(`${basePath}/${planId}`);
      const json = await res.json();
      if (json.data) {
        weekCache.current.set(ws, json.data);
        return json.data as WeeklyPlanWithTasks;
      }
    } catch {
      // silent fail for prefetch
    }
    return null;
  }, [basePath]);

  // -- Fetch current week plan --
  const fetchPlan = useCallback(async () => {
    // Show cached data instantly if we have it
    const cached = weekCache.current.get(weekStart);
    if (cached) {
      setPlan(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const fetched = await fetchWeekPlan(weekStart);
    if (fetched) {
      setPlan(fetched);
      weekCache.current.set(weekStart, fetched);
    }
    setLoading(false);

    // Prefetch adjacent weeks in background
    const prevWs = offsetWeek(weekStart, -1);
    const nextWs = offsetWeek(weekStart, 1);
    if (!weekCache.current.has(prevWs)) fetchWeekPlan(prevWs, true);
    if (!weekCache.current.has(nextWs)) fetchWeekPlan(nextWs, true);
  }, [weekStart, fetchWeekPlan]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // -- Fetch 4-week data when in 4-week mode --
  useEffect(() => {
    if (viewMode !== '4weeks') return;
    const fetchFourWeeks = async () => {
      const weeks: (WeeklyPlanWithTasks | null)[] = [];
      for (let i = 0; i < 4; i++) {
        const ws = offsetWeek(weekStart, i);
        const cached = weekCache.current.get(ws);
        weeks.push(cached || await fetchWeekPlan(ws));
      }
      setFourWeekPlans(weeks);
    };
    fetchFourWeeks();
  }, [viewMode, weekStart, fetchWeekPlan]);

  // -- Week navigation --
  const goWeek = (delta: number) => {
    setWeekStart(prev => offsetWeek(prev, delta));
  };

  const goToday = () => setWeekStart(getMonday(new Date()));

  // -- Task CRUD --
  const addTask = async (title: string, dayIndex: number = 1) => {
    if (!plan) return;
    const dayStart = dayIndex === 0 ? 0 : dayIndex;
    const dayEnd = dayIndex === 0 ? 0 : dayIndex;
    try {
      const res = await fetch(`${basePath}/${plan.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, day_start: dayStart, day_end: dayEnd }),
      });
      const json = await res.json();
      if (json.data) {
        const updated = { ...plan, tasks: [...plan.tasks, json.data] };
        setPlan(updated);
        weekCache.current.set(weekStart, updated);
      } else {
        console.error('Failed to save task:', json.error);
      }
    } catch (err) {
      console.error('Failed to save task:', err);
    }
  };

  const updateTask = async (taskId: string, updates: Partial<WeeklyTask>) => {
    if (!plan) return;

    // Optimistic update
    const updated = {
      ...plan,
      tasks: plan.tasks.map((t) =>
        t.id === taskId ? {
          ...t,
          ...updates,
          completed_at: updates.completed ? new Date().toISOString() : (updates.completed === false ? null : t.completed_at),
        } : t
      ),
    };
    setPlan(updated);
    weekCache.current.set(weekStart, updated);

    await fetch(`${basePath}/${plan.id}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  };

  const removeTask = async (taskId: string) => {
    if (!plan) return;
    const updated = { ...plan, tasks: plan.tasks.filter((t) => t.id !== taskId) };
    setPlan(updated);
    weekCache.current.set(weekStart, updated);
    await fetch(`${basePath}/${plan.id}/tasks/${taskId}`, { method: 'DELETE' });
  };

  // -- Drag & Drop handler --
  const onDragEnd = async (result: DropResult) => {
    if (!plan || !result.destination) return;

    const { source, destination, draggableId } = result;
    const srcDay = parseInt(source.droppableId.replace('day-', ''));
    const destDay = parseInt(destination.droppableId.replace('day-', ''));

    if (srcDay === destDay && source.index === destination.index) return;

    // Get tasks for source and destination days
    const getTasksForDay = (day: number) =>
      plan.tasks
        .filter(t => day === 0 ? t.day_start === 0 : (t.day_start <= day && t.day_end >= day))
        .sort((a, b) => a.sort_order - b.sort_order);

    const task = plan.tasks.find(t => t.id === draggableId);
    if (!task) return;

    if (srcDay === destDay) {
      // Reorder within same day
      const dayTasks = getTasksForDay(srcDay);
      const reordered = [...dayTasks];
      const [removed] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, removed);

      // Optimistic update sort_order
      const taskIds = reordered.map(t => t.id);
      const updatedTasks = plan.tasks.map(t => {
        const idx = taskIds.indexOf(t.id);
        return idx >= 0 ? { ...t, sort_order: idx } : t;
      });
      const updated = { ...plan, tasks: updatedTasks };
      setPlan(updated);
      weekCache.current.set(weekStart, updated);

      await fetch(`${basePath}/${plan.id}/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_ids: taskIds }),
      });
    } else {
      // Move to different day
      const newDayStart = destDay;
      const newDayEnd = destDay;

      const updatedTasks = plan.tasks.map(t =>
        t.id === draggableId ? { ...t, day_start: newDayStart, day_end: newDayEnd } : t
      );
      const updated = { ...plan, tasks: updatedTasks };
      setPlan(updated);
      weekCache.current.set(weekStart, updated);

      await fetch(`${basePath}/${plan.id}/tasks/${draggableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_start: newDayStart, day_end: newDayEnd }),
      });
    }
  };

  // -- Day customization --
  const updateDayColor = async (dayIndex: number, color: string | null) => {
    if (!plan) return;
    const dayColors = { ...(plan.day_colors || {}), [String(dayIndex)]: color || '' };
    if (!color) delete dayColors[String(dayIndex)];

    const updated = { ...plan, day_colors: dayColors };
    setPlan(updated);
    weekCache.current.set(weekStart, updated);

    await fetch(`${basePath}/${plan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_colors: dayColors }),
    });
  };

  const updateDayLabel = async (dayIndex: number, label: string) => {
    if (!plan) return;
    const dayLabels = { ...(plan.day_labels || {}), [String(dayIndex)]: label };
    if (!label) delete dayLabels[String(dayIndex)];

    const updated = { ...plan, day_labels: dayLabels };
    setPlan(updated);
    weekCache.current.set(weekStart, updated);

    await fetch(`${basePath}/${plan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_labels: dayLabels }),
    });
  };

  // -- Copy from last week --
  const copyLastWeek = async () => {
    if (!plan) return;

    const prevWeekStart = offsetWeek(weekStart, -1);

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

    weekCache.current.delete(weekStart);
    fetchPlan();
  };

  // -- Send email --
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

  // -- Print --
  const handlePrint = () => window.print();

  // -- Snapshot (with feedback) --
  const saveSnapshot = async () => {
    if (!plan) return;
    try {
      const res = await fetch(`${basePath}/${plan.id}/snapshot`, { method: 'POST' });
      if (res.ok) {
        setSnapshotMsg('Snapshot saved!');
      } else {
        setSnapshotMsg('Failed to save snapshot');
      }
    } catch {
      setSnapshotMsg('Failed to save snapshot');
    }
    setTimeout(() => setSnapshotMsg(''), 2500);
  };

  // -- Compute today column --
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const todayIndex = (() => {
    for (let i = 1; i <= 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + (i - 1));
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (ds === todayStr) return i;
    }
    return -1;
  })();

  // Build date info for each day
  const buildDayCards = (ws: string, planData: WeeklyPlanWithTasks | null) => {
    const wsToday = (() => {
      for (let i = 1; i <= 7; i++) {
        const d = new Date(ws);
        d.setDate(d.getDate() + (i - 1));
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (ds === todayStr) return i;
      }
      return -1;
    })();

    return DAY_LABELS.map((label, i) => {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      const dayIndex = i + 1;

      const dayTasks = (planData?.tasks ?? []).filter(
        t => t.day_start > 0 && t.day_start <= dayIndex && t.day_end >= dayIndex
      );

      return {
        dayIndex,
        label,
        date: d.getDate(),
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        isToday: dayIndex === wsToday,
        isWeekend: i >= 5,
        tasks: dayTasks,
        dayColor: planData?.day_colors?.[String(dayIndex)] || null,
        dayLabel: planData?.day_labels?.[String(dayIndex)] || null,
      };
    });
  };

  const dayCards = buildDayCards(weekStart, plan);

  // Weekly slot: tasks with day_start === 0
  const weeklyTasks = (plan?.tasks ?? []).filter(t => t.day_start === 0);

  if (loading && !plan) {
    return (
      <div className="animate-pulse space-y-3 p-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-cream-dark/40 dark:bg-slate-800/40" />
        ))}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Client view banner */}
        {isClientView && (
          <div className="shrink-0 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200 font-body">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Viewing as {clientName} - Client Portal Preview
            </div>
            <button
              type="button"
              onClick={() => setIsClientView(false)}
              className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 px-2 py-1 rounded hover:bg-amber-100 dark:hover:bg-amber-800/30 transition-colors font-body"
            >
              Exit Preview
            </button>
          </div>
        )}

        {/* Snapshot feedback */}
        {snapshotMsg && (
          <div className="shrink-0 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-1.5 text-xs text-green-700 dark:text-green-300 font-body text-center">
            {snapshotMsg}
          </div>
        )}

        {/* Header toolbar */}
        <WeeklyGanttHeader
          clientName={displayName}
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
          isClientView={isClientView}
          onToggleClientView={() => setIsClientView(v => !v)}
          viewMode={viewMode}
          onToggleViewMode={() => setViewMode(v => v === '1week' ? '4weeks' : '1week')}
        />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main card grid area */}
          <div ref={printRef} className="flex-1 overflow-auto print:overflow-visible p-4">
            {viewMode === '1week' ? (
              <>
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
                      teamMembers={teamMembers}
                      dayColor={day.dayColor}
                      dayLabelText={day.dayLabel}
                      isClientView={isClientView}
                      onUpdateTask={updateTask}
                      onDeleteTask={removeTask}
                      onAddTask={addTask}
                      onUpdateDayColor={updateDayColor}
                      onUpdateDayLabel={updateDayLabel}
                    />
                  ))}
                </div>

                {/* Row 2: Fri - Sun + Weekly slot */}
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
                      teamMembers={teamMembers}
                      dayColor={day.dayColor}
                      dayLabelText={day.dayLabel}
                      isClientView={isClientView}
                      onUpdateTask={updateTask}
                      onDeleteTask={removeTask}
                      onAddTask={addTask}
                      onUpdateDayColor={updateDayColor}
                      onUpdateDayLabel={updateDayLabel}
                    />
                  ))}

                  {/* Weekly slot - unassigned tasks */}
                  <DayCard
                    dayIndex={0}
                    dayLabel="Weekly"
                    date={0}
                    month=""
                    isToday={false}
                    isWeekend={false}
                    tasks={weeklyTasks}
                    clientContacts={clientContacts}
                    teamMembers={teamMembers}
                    dayColor={plan?.day_colors?.['0'] || null}
                    dayLabelText={plan?.day_labels?.['0'] || null}
                    isClientView={isClientView}
                    onUpdateTask={updateTask}
                    onDeleteTask={removeTask}
                    onAddTask={addTask}
                    onUpdateDayColor={updateDayColor}
                    onUpdateDayLabel={updateDayLabel}
                  />
                </div>
              </>
            ) : (
              /* 4-week compact view */
              <div className="space-y-4">
                {[0, 1, 2, 3].map(weekOffset => {
                  const ws = offsetWeek(weekStart, weekOffset);
                  const weekPlan = weekOffset === 0 ? plan : fourWeekPlans[weekOffset] || null;
                  const cards = buildDayCards(ws, weekPlan);
                  const weekEnd = new Date(ws);
                  weekEnd.setDate(weekEnd.getDate() + 6);
                  const weekLabel = `${formatShortDate(ws)} - ${formatShortDate(weekEnd)}`;

                  return (
                    <div key={ws}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] font-medium text-navy/50 dark:text-slate-400 font-body">
                          {weekLabel}
                        </span>
                        {weekOffset === 0 && (
                          <span className="text-[9px] font-bold text-electric bg-electric/10 px-1.5 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-7 gap-2">
                        {cards.map(day => (
                          <CompactDayCard
                            key={`${ws}-${day.dayIndex}`}
                            dayLabel={day.label}
                            date={day.date}
                            isToday={day.isToday}
                            tasks={day.tasks}
                            dayColor={day.dayColor}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
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
    </DragDropContext>
  );
}

// -- Compact day card for 4-week view --
function CompactDayCard({
  dayLabel,
  date,
  isToday,
  tasks,
  dayColor,
}: {
  dayLabel: string;
  date: number;
  isToday: boolean;
  tasks: WeeklyTask[];
  dayColor: string | null;
}) {
  const completed = tasks.filter(t => t.completed).length;
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 min-h-[60px] ${
        isToday
          ? 'border-electric/40 bg-electric/[0.03] ring-1 ring-electric/20'
          : 'border-cream-dark/60 dark:border-slate-700/60 bg-white dark:bg-dark-surface'
      }`}
      style={dayColor ? { backgroundColor: dayColor } : undefined}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[9px] font-semibold uppercase tracking-wider ${
          isToday ? 'text-electric' : 'text-navy/40 dark:text-slate-500'
        }`}>
          {dayLabel} {date}
        </span>
        {tasks.length > 0 && (
          <span className="text-[8px] text-navy/30 dark:text-slate-600">
            {completed}/{tasks.length}
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        {tasks.slice(0, 3).map(t => (
          <div key={t.id} className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              t.completed ? 'bg-green-400' : 'bg-electric'
            }`} />
            <span className={`text-[9px] truncate ${
              t.completed ? 'line-through text-navy/25' : 'text-navy/60 dark:text-slate-400'
            }`}>
              {t.title}
            </span>
          </div>
        ))}
        {tasks.length > 3 && (
          <span className="text-[8px] text-navy/25 dark:text-slate-600">
            +{tasks.length - 3} more
          </span>
        )}
      </div>
    </div>
  );
}

// -- Helpers --
function offsetWeek(weekStart: string, delta: number): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + delta * 7);
  return getMonday(d);
}

function formatShortDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
