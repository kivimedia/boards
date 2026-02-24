'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WeeklyPlanSnapshot, WeeklyTask } from '@/lib/types';
import { DAY_LABELS } from '@/lib/weekly-gantt';

interface HistoryPanelProps {
  planId: string;
  clientId: string;
  onClose: () => void;
}

export function HistoryPanel({ planId, clientId, onClose }: HistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<WeeklyPlanSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/weekly-plans/${planId}/snapshot`
      );
      const json = await res.json();
      if (json.data) setSnapshots(json.data);
    } finally {
      setLoading(false);
    }
  }, [clientId, planId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const selected = snapshots.find((s) => s.id === selectedId);
  const tasks = (selected?.snapshot_data ?? []) as WeeklyTask[];

  return (
    <div className="w-80 shrink-0 border-l border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface overflow-auto print:hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-cream-dark dark:border-slate-700">
        <h3 className="text-sm font-bold text-navy dark:text-slate-100 font-heading">
          History
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-navy/30 hover:text-navy dark:text-slate-600 dark:hover:text-slate-300"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="p-4 text-xs text-navy/40 dark:text-slate-500 font-body">Loading...</div>
      ) : snapshots.length === 0 ? (
        <div className="p-4 text-xs text-navy/40 dark:text-slate-500 font-body">
          No snapshots yet. Save a snapshot to track changes over time.
        </div>
      ) : (
        <div className="divide-y divide-cream-dark/50 dark:divide-slate-700/50">
          {/* Snapshot list */}
          {snapshots.map((snap) => (
            <button
              key={snap.id}
              type="button"
              onClick={() => setSelectedId(snap.id === selectedId ? null : snap.id)}
              className={`w-full text-left px-4 py-2.5 transition-colors ${
                snap.id === selectedId
                  ? 'bg-electric/5 dark:bg-electric/10'
                  : 'hover:bg-cream/40 dark:hover:bg-slate-800/20'
              }`}
            >
              <p className="text-xs font-medium text-navy dark:text-slate-200 font-body">
                {new Date(snap.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body capitalize">
                {snap.snapshot_reason.replace('_', ' ')} &middot;{' '}
                {(snap.snapshot_data as WeeklyTask[]).length} tasks
              </p>
            </button>
          ))}

          {/* Selected snapshot preview */}
          {selected && tasks.length > 0 && (
            <div className="p-3 bg-cream/30 dark:bg-slate-800/40">
              <p className="text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-2">
                Snapshot Preview
              </p>
              {tasks.map((t, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <span className={`text-[10px] ${t.completed ? 'line-through text-navy/30 dark:text-slate-600' : 'text-navy dark:text-slate-200'} font-body truncate flex-1`}>
                    {t.title}
                  </span>
                  <span className="text-[9px] text-navy/30 dark:text-slate-500 font-body shrink-0">
                    {DAY_LABELS[t.day_start - 1]}
                    {t.day_end !== t.day_start && `–${DAY_LABELS[t.day_end - 1]}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
