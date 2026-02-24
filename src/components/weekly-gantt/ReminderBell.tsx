'use client';

import { useState, useRef, useEffect } from 'react';
import type { WeeklyTask } from '@/lib/types';

interface ReminderBellProps {
  task: WeeklyTask;
  planId: string;
  clientId: string;
  onUpdate: (updates: Partial<WeeklyTask>) => void;
}

export function ReminderBell({ task, onUpdate }: ReminderBellProps) {
  const [open, setOpen] = useState(false);
  const [dateTime, setDateTime] = useState(task.reminder_at || '');
  const popoverRef = useRef<HTMLDivElement>(null);

  const hasReminder = !!task.reminder_at && !task.reminder_sent;
  const reminderSent = task.reminder_sent;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const saveReminder = () => {
    if (dateTime) {
      onUpdate({ reminder_at: new Date(dateTime).toISOString(), reminder_sent: false });
    }
    setOpen(false);
  };

  const clearReminder = () => {
    onUpdate({ reminder_at: null, reminder_sent: false });
    setDateTime('');
    setOpen(false);
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-1 rounded transition-colors ${
          hasReminder
            ? 'text-amber-500 hover:text-amber-600 animate-pulse'
            : reminderSent
              ? 'text-green-500'
              : 'text-navy/20 hover:text-navy/50 dark:text-slate-600 dark:hover:text-slate-400'
        }`}
        title={
          hasReminder
            ? `Reminder set: ${new Date(task.reminder_at!).toLocaleString()}`
            : reminderSent
              ? 'Reminder sent'
              : 'Set reminder'
        }
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill={hasReminder ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-cream-dark dark:border-slate-700 p-3 min-w-[220px]">
          <p className="text-xs font-semibold text-navy/70 dark:text-slate-300 font-heading mb-2">
            Set Reminder
          </p>
          <input
            type="datetime-local"
            value={dateTime ? dateTime.slice(0, 16) : ''}
            onChange={(e) => setDateTime(e.target.value)}
            className="w-full text-xs border border-cream-dark dark:border-slate-600 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-navy dark:text-slate-200 font-body mb-2"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={saveReminder}
              disabled={!dateTime}
              className="flex-1 text-xs py-1.5 rounded-md bg-electric text-white font-medium font-body disabled:opacity-50 hover:bg-electric/90"
            >
              Save
            </button>
            {hasReminder && (
              <button
                type="button"
                onClick={clearReminder}
                className="text-xs py-1.5 px-3 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium font-body"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
