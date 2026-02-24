'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { WeeklyTask, Profile } from '@/lib/types';
import { ReminderBell } from './ReminderBell';

interface TaskRowProps {
  task: WeeklyTask;
  todayIndex: number;
  teamMembers: Profile[];
  onUpdate: (updates: Partial<WeeklyTask>) => void;
  onDelete: () => void;
  planId: string;
  clientId: string;
}

const PRIORITY_COLORS: Record<string, { bar: string; bg: string; dot: string }> = {
  high: { bar: '#fb923c', bg: '#fff7ed', dot: 'bg-orange-400' },
  medium: { bar: '#6366f1', bg: '#eef2ff', dot: 'bg-electric' },
  low: { bar: '#4ade80', bg: '#f0fdf4', dot: 'bg-green-400' },
};

export function TaskRow({
  task,
  todayIndex,
  teamMembers,
  onUpdate,
  onDelete,
  planId,
  clientId,
}: TaskRowProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ownerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  // Close owner picker on outside click
  useEffect(() => {
    if (!showOwnerPicker) return;
    const handler = (e: MouseEvent) => {
      if (ownerRef.current && !ownerRef.current.contains(e.target as Node)) {
        setShowOwnerPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showOwnerPicker]);

  const saveTitle = () => {
    setEditing(false);
    if (title.trim() && title !== task.title) {
      onUpdate({ title: title.trim() });
    } else {
      setTitle(task.title);
    }
  };

  // ── Completion with satisfying animation ───────────────────────────
  const toggleComplete = useCallback(() => {
    const newCompleted = !task.completed;
    if (newCompleted) {
      setCompleting(true);
      setShowConfetti(true);
      // Remove confetti after animation
      setTimeout(() => setShowConfetti(false), 1200);
      setTimeout(() => setCompleting(false), 600);
    }
    onUpdate({ completed: newCompleted });
  }, [task.completed, onUpdate]);

  // ── Priority cycling ───────────────────────────────────────────────
  const cyclePriority = () => {
    const order = ['low', 'medium', 'high'];
    const idx = order.indexOf(task.priority);
    const next = order[(idx + 1) % order.length];
    onUpdate({ priority: next as WeeklyTask['priority'] });
  };

  // ── Day bar drag ──────────────────────────────────────────────────
  const handleDayClick = (day: number) => {
    if (task.completed) return;
    // If clicking within current range, shrink. Otherwise, extend.
    if (day >= task.day_start && day <= task.day_end) {
      // Clicking inside range — set as single day
      onUpdate({ day_start: day, day_end: day });
    } else if (day < task.day_start) {
      onUpdate({ day_start: day });
    } else {
      onUpdate({ day_end: day });
    }
  };

  const handleDayDragStart = (day: number) => {
    if (task.completed) return;
    onUpdate({ day_start: day, day_end: day });
  };

  const handleDayDragEnter = (day: number) => {
    if (task.completed) return;
    // Extend range from original start to this day
    const start = Math.min(task.day_start, day);
    const end = Math.max(task.day_start, day);
    onUpdate({ day_start: start, day_end: end });
  };

  const colors = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const owner = task.owner_id
    ? teamMembers.find((m) => m.id === task.owner_id)
    : null;

  return (
    <div
      className={`group grid grid-cols-[minmax(200px,2fr)_100px_repeat(7,1fr)_40px] items-center border-b border-cream-dark/50 dark:border-slate-700/50 relative transition-colors ${
        task.completed ? 'bg-cream/30 dark:bg-slate-800/30' : 'hover:bg-cream/40 dark:hover:bg-slate-800/20'
      }`}
    >
      {/* Confetti burst */}
      {showConfetti && <ConfettiBurst />}

      {/* Checkbox + Title */}
      <div className="flex items-center gap-2 px-4 py-2.5 min-w-0">
        {/* Priority dot (click to cycle) */}
        <button
          type="button"
          onClick={cyclePriority}
          className={`w-2 h-2 rounded-full shrink-0 ${colors.dot} transition-colors`}
          title={`Priority: ${task.priority}`}
        />

        {/* Checkbox */}
        <button
          type="button"
          onClick={toggleComplete}
          className={`w-4.5 h-4.5 rounded border-2 shrink-0 flex items-center justify-center transition-all duration-300 ${
            task.completed
              ? 'bg-green-500 border-green-500 scale-110'
              : 'border-navy/20 dark:border-slate-600 hover:border-electric'
          } ${completing ? 'animate-bounce' : ''}`}
        >
          {task.completed && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>

        {/* Title (inline edit) */}
        {editing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') { setTitle(task.title); setEditing(false); }
            }}
            className="flex-1 text-sm font-body bg-transparent border-b border-electric/50 outline-none text-navy dark:text-slate-100 py-0"
          />
        ) : (
          <span
            onClick={() => !task.completed && setEditing(true)}
            className={`flex-1 text-sm font-body truncate cursor-text transition-all duration-500 ${
              task.completed
                ? 'line-through text-navy/30 dark:text-slate-600'
                : 'text-navy dark:text-slate-100'
            }`}
            title={task.title}
          >
            {task.title}
          </span>
        )}
      </div>

      {/* Owner */}
      <div className="px-2 relative" ref={ownerRef}>
        <button
          type="button"
          onClick={() => setShowOwnerPicker((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 font-body truncate max-w-full"
          title={owner?.display_name || 'Assign owner'}
        >
          {owner ? (
            <>
              <span className="w-5 h-5 rounded-full bg-electric/20 text-electric text-[9px] font-bold flex items-center justify-center shrink-0">
                {owner.display_name.slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate">{owner.display_name.split(' ')[0]}</span>
            </>
          ) : (
            <span className="text-navy/30 dark:text-slate-600">—</span>
          )}
        </button>

        {/* Owner dropdown */}
        {showOwnerPicker && (
          <div className="absolute top-full left-0 mt-1 z-20 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-cream-dark dark:border-slate-700 py-1 min-w-[160px]">
            <button
              type="button"
              onClick={() => { onUpdate({ owner_id: null }); setShowOwnerPicker(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-navy/50 dark:text-slate-400 hover:bg-cream dark:hover:bg-slate-700 font-body"
            >
              Unassigned
            </button>
            {teamMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => { onUpdate({ owner_id: member.id }); setShowOwnerPicker(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-cream dark:hover:bg-slate-700 font-body flex items-center gap-2 ${
                  member.id === task.owner_id ? 'text-electric font-medium' : 'text-navy dark:text-slate-200'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-electric/20 text-electric text-[9px] font-bold flex items-center justify-center shrink-0">
                  {member.display_name.slice(0, 2).toUpperCase()}
                </span>
                {member.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Day cells (Mon–Sun) */}
      {[1, 2, 3, 4, 5, 6, 7].map((day) => {
        const inRange = day >= task.day_start && day <= task.day_end;
        const isStart = day === task.day_start;
        const isEnd = day === task.day_end;
        const isToday = day === todayIndex;
        const isWeekend = day >= 6;

        return (
          <div
            key={day}
            onMouseDown={() => handleDayDragStart(day)}
            onMouseEnter={(e) => e.buttons === 1 && handleDayDragEnter(day)}
            onClick={() => handleDayClick(day)}
            className={`h-10 flex items-center justify-center cursor-pointer select-none transition-colors ${
              isToday ? 'bg-electric/5 dark:bg-electric/10' : isWeekend ? 'bg-cream/40 dark:bg-navy/20' : ''
            }`}
          >
            {inRange && (
              <div
                className={`h-6 w-full mx-0.5 flex items-center justify-center transition-all duration-300 ${
                  task.completed ? 'opacity-40' : ''
                } ${isStart && isEnd ? 'rounded-md' : isStart ? 'rounded-l-md' : isEnd ? 'rounded-r-md' : ''}`}
                style={{
                  backgroundColor: task.completed ? '#86efac' : `${colors.bar}22`,
                  borderTop: `2px solid ${task.completed ? '#22c55e' : colors.bar}`,
                  borderBottom: `2px solid ${task.completed ? '#22c55e' : colors.bar}`,
                  borderLeft: isStart ? `2px solid ${task.completed ? '#22c55e' : colors.bar}` : 'none',
                  borderRight: isEnd ? `2px solid ${task.completed ? '#22c55e' : colors.bar}` : 'none',
                }}
              />
            )}
          </div>
        );
      })}

      {/* Actions: bell + delete */}
      <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <ReminderBell
          task={task}
          planId={planId}
          clientId={clientId}
          onUpdate={onUpdate}
        />
        <button
          type="button"
          onClick={onDelete}
          className="p-1 rounded text-navy/20 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
          title="Delete task"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Confetti Burst (pure CSS) ────────────────────────────────────────
function ConfettiBurst() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full animate-confetti-burst"
          style={{
            left: '20px',
            top: '50%',
            backgroundColor: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'][i % 6],
            animationDelay: `${i * 40}ms`,
            // @ts-expect-error CSS custom properties for confetti direction
            '--confetti-x': `${(Math.random() - 0.3) * 120}px`,
            '--confetti-y': `${(Math.random() - 0.5) * 60}px`,
          }}
        />
      ))}
    </div>
  );
}
