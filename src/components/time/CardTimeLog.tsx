'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TimeEntry } from '@/lib/types';

interface CardTimeLogProps {
  cardId: string;
}

interface CardTimeData {
  entries: TimeEntry[];
  totalMinutes: number;
  billableMinutes: number;
  estimatedHours: number | null;
  actualHours: number;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CardTimeLog({ cardId }: CardTimeLogProps) {
  const [data, setData] = useState<CardTimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/time`);
      if (!res.ok) throw new Error('Failed to load time data');
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = useCallback(async (entryId: string) => {
    try {
      const res = await fetch(`/api/time-entries/${entryId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      fetchData();
    } catch {
      setError('Failed to delete entry');
      setTimeout(() => setError(null), 3000);
    }
  }, [fetchData]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm p-6">
        <div className="flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm p-4">
        <p className="text-xs text-red-600 font-body">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { entries, totalMinutes, billableMinutes, estimatedHours, actualHours } = data;
  const progressPercent = estimatedHours && estimatedHours > 0
    ? Math.min(100, Math.round((actualHours / estimatedHours) * 100))
    : null;
  const isOverEstimate = estimatedHours !== null && actualHours > estimatedHours;

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Time Log</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body">Total</p>
            <p className="text-sm font-bold text-navy dark:text-slate-100 font-heading">{formatDuration(totalMinutes)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body">Billable</p>
            <p className="text-sm font-bold text-electric font-heading">{formatDuration(billableMinutes)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body">Entries</p>
            <p className="text-sm font-bold text-navy dark:text-slate-100 font-heading">{entries.length}</p>
          </div>
        </div>

        {/* Estimate vs Actual bar */}
        {estimatedHours !== null && estimatedHours > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-navy/60 dark:text-slate-400 font-body">Estimate vs Actual</span>
              <span className={`text-xs font-semibold font-body ${isOverEstimate ? 'text-red-600' : 'text-green-600'}`}>
                {actualHours.toFixed(1)}h / {estimatedHours}h
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-cream-dark dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOverEstimate ? 'bg-red-500' : 'bg-green-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {isOverEstimate && (
              <p className="text-xs text-red-500 font-body mt-1">
                Over estimate by {(actualHours - estimatedHours).toFixed(1)}h
              </p>
            )}
          </div>
        )}

        {/* Entry list */}
        {entries.length === 0 ? (
          <p className="text-xs text-navy/40 dark:text-slate-500 font-body text-center py-3">
            No time entries yet
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-cream/50 dark:bg-navy/30 border border-cream-dark dark:border-slate-700 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-navy dark:text-slate-100 font-body truncate">
                      {entry.description || 'No description'}
                    </p>
                    {entry.is_billable && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-electric/10 text-electric shrink-0">
                        $
                      </span>
                    )}
                    {entry.is_running && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 shrink-0 animate-pulse">
                        LIVE
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body mt-0.5">
                    {formatDate(entry.started_at)}
                    {entry.ended_at && ` - ${formatDate(entry.ended_at)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-xs font-semibold text-navy dark:text-slate-100 font-body">
                    {entry.duration_minutes ? formatDuration(entry.duration_minutes) : '--'}
                  </span>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="p-1 rounded text-navy/20 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete entry"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
