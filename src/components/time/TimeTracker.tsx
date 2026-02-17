'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TimeEntry } from '@/lib/types';

interface TimeTrackerProps {
  cardId: string;
  boardId?: string;
  clientId?: string;
  onEntryCreated?: (entry: TimeEntry) => void;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TimeTracker({ cardId, boardId, clientId, onEntryCreated }: TimeTrackerProps) {
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [description, setDescription] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch running timer on mount
  useEffect(() => {
    async function fetchRunning() {
      try {
        const res = await fetch('/api/time-entries/running');
        if (!res.ok) return;
        const json = await res.json();
        if (json.data && json.data.card_id === cardId) {
          setRunning(json.data);
          setDescription(json.data.description || '');
          setIsBillable(json.data.is_billable);
        }
      } catch {
        // Silently fail
      }
    }
    fetchRunning();
  }, [cardId]);

  // Elapsed time ticker
  useEffect(() => {
    if (running) {
      const startedAt = new Date(running.started_at).getTime();
      const tick = () => {
        const now = Date.now();
        setElapsed(Math.floor((now - startedAt) / 1000));
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      setElapsed(0);
    }
  }, [running]);

  const handleStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          type: 'timer',
          board_id: boardId,
          client_id: clientId,
          description: description.trim() || undefined,
          is_billable: isBillable,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to start timer');
      }
      const json = await res.json();
      setRunning(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start timer');
    } finally {
      setLoading(false);
    }
  }, [cardId, boardId, clientId, description, isBillable]);

  const handleStop = useCallback(async () => {
    if (!running) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/time-entries/${running.id}/stop`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to stop timer');
      }
      const json = await res.json();
      setRunning(null);
      setDescription('');
      onEntryCreated?.(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop timer');
    } finally {
      setLoading(false);
    }
  }, [running, onEntryCreated]);

  const isTimerRunning = running !== null;

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Time Tracker</h3>
      </div>

      <div className="p-4 space-y-3">
        {/* Timer display */}
        <div className="flex items-center justify-center">
          <span
            className={`text-3xl font-mono font-bold tracking-wider ${
              isTimerRunning ? 'text-electric' : 'text-navy/30 dark:text-slate-600'
            }`}
          >
            {formatElapsed(elapsed)}
          </span>
        </div>

        {/* Description */}
        <input
          type="text"
          placeholder="What are you working on?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isTimerRunning}
          className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-bg text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric disabled:opacity-50"
        />

        {/* Billable toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={isBillable}
            onClick={() => !isTimerRunning && setIsBillable(!isBillable)}
            disabled={isTimerRunning}
            className={`
              relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0
              ${isBillable ? 'bg-electric' : 'bg-navy/20 dark:bg-slate-700'}
              ${isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <span
              className={`
                absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
                ${isBillable ? 'translate-x-4' : 'translate-x-0'}
              `}
            />
          </button>
          <span className="text-xs font-medium text-navy/60 dark:text-slate-400 font-body">Billable</span>
        </label>

        {/* Start/Stop button */}
        <button
          onClick={isTimerRunning ? handleStop : handleStart}
          disabled={loading}
          className={`
            w-full py-2.5 rounded-xl text-sm font-semibold font-body transition-all duration-200
            ${isTimerRunning
              ? 'bg-red-500 text-white hover:bg-red-600'
              : 'bg-electric text-white hover:bg-electric/90'
            }
            ${loading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {loading
            ? 'Working...'
            : isTimerRunning
              ? 'Stop Timer'
              : 'Start Timer'
          }
        </button>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 font-body">{error}</p>
        )}
      </div>
    </div>
  );
}
