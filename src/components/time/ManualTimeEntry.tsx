'use client';

import { useState, useCallback } from 'react';
import type { TimeEntry } from '@/lib/types';

interface ManualTimeEntryProps {
  cardId: string;
  boardId?: string;
  clientId?: string;
  onEntryCreated?: (entry: TimeEntry) => void;
}

export default function ManualTimeEntry({ cardId, boardId, clientId, onEntryCreated }: ManualTimeEntryProps) {
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [description, setDescription] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const startedAt = new Date(`${date}T${startTime}:00`).toISOString();
    const endedAt = new Date(`${date}T${endTime}:00`).toISOString();

    if (new Date(endedAt) <= new Date(startedAt)) {
      setError('End time must be after start time');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: cardId,
          type: 'manual',
          board_id: boardId,
          client_id: clientId,
          description: description.trim() || undefined,
          is_billable: isBillable,
          started_at: startedAt,
          ended_at: endedAt,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create time entry');
      }

      const json = await res.json();
      setSuccess(true);
      setDescription('');
      onEntryCreated?.(json.data);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create entry');
    } finally {
      setLoading(false);
    }
  }, [cardId, boardId, clientId, date, startTime, endTime, description, isBillable, onEntryCreated]);

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Manual Time Entry</h3>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-bg text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
          />
        </div>

        {/* Time range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Start</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-bg text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">End</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-bg text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Description</label>
          <input
            type="text"
            placeholder="What did you work on?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-bg text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
          />
        </div>

        {/* Billable toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={isBillable}
            onClick={() => setIsBillable(!isBillable)}
            className={`
              relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0
              ${isBillable ? 'bg-electric' : 'bg-navy/20 dark:bg-slate-700'}
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

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className={`
            w-full py-2.5 rounded-xl text-sm font-semibold font-body bg-electric text-white
            hover:bg-electric/90 transition-all duration-200
            ${loading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {loading ? 'Saving...' : 'Add Time Entry'}
        </button>

        {/* Error / Success */}
        {error && <p className="text-xs text-red-600 font-body">{error}</p>}
        {success && <p className="text-xs text-green-600 font-body">Time entry added successfully</p>}
      </form>
    </div>
  );
}
