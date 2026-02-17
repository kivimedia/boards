'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RevisionMetrics, CardColumnHistory } from '@/lib/types';

interface RevisionDrillDownProps {
  cardId: string;
  onClose?: () => void;
}

const REVISION_KEYWORDS = ['revision', 'revisions', 'changes requested', 'client revisions'];
const WORK_KEYWORDS = ['in progress', 'working', 'in development', 'designing'];

function classifyColumn(name: string | null): 'revision' | 'work' | 'other' {
  const lower = (name ?? '').toLowerCase();
  if (REVISION_KEYWORDS.some((k) => lower.includes(k))) return 'revision';
  if (WORK_KEYWORDS.some((k) => lower.includes(k))) return 'work';
  return 'other';
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function RevisionDrillDown({ cardId, onClose }: RevisionDrillDownProps) {
  const [metrics, setMetrics] = useState<RevisionMetrics | null>(null);
  const [history, setHistory] = useState<CardColumnHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metricsRes, historyRes] = await Promise.all([
        fetch(`/api/cards/${cardId}/revision-metrics`),
        fetch(`/api/cards/${cardId}/activity?type=column_move`),
      ]);

      if (metricsRes.ok) {
        const metricsJson = await metricsRes.json();
        setMetrics(metricsJson.data ?? null);
      }

      if (historyRes.ok) {
        const historyJson = await historyRes.json();
        setHistory(historyJson.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load card data');
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Identify ping-pong transitions (work -> revision pairs)
  const pingPongPairs: { from: CardColumnHistory; to: CardColumnHistory }[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    const prevType = classifyColumn(prev.to_list_name);
    const currType = classifyColumn(curr.to_list_name);
    if (prevType === 'work' && currType === 'revision') {
      pingPongPairs.push({ from: prev, to: curr });
    }
  }

  // Calculate revision time breakdown per stint
  const revisionStints: { enteredAt: string; exitedAt: string | null; durationMinutes: number }[] = [];
  let enteredRevision: string | null = null;
  for (const entry of history) {
    const type = classifyColumn(entry.to_list_name);
    if (type === 'revision' && !enteredRevision) {
      enteredRevision = entry.moved_at;
    } else if (type !== 'revision' && enteredRevision) {
      const dur = Math.round(
        (new Date(entry.moved_at).getTime() - new Date(enteredRevision).getTime()) / 60000
      );
      revisionStints.push({
        enteredAt: enteredRevision,
        exitedAt: entry.moved_at,
        durationMinutes: dur,
      });
      enteredRevision = null;
    }
  }
  // If still in revision column
  if (enteredRevision) {
    revisionStints.push({
      enteredAt: enteredRevision,
      exitedAt: null,
      durationMinutes: Math.round(
        (Date.now() - new Date(enteredRevision).getTime()) / 60000
      ),
    });
  }

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Card Revision Drill-Down</h3>
          <p className="text-xs text-navy/50 dark:text-slate-400 dark:text-slate-400 font-body font-mono">{cardId}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors text-navy/40 dark:text-slate-500 dark:text-slate-500 hover:text-navy dark:hover:text-slate-100"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {loading && (
        <div className="p-8 text-center text-navy/40 dark:text-slate-500 dark:text-slate-500 text-sm font-body">Loading card data...</div>
      )}

      {error && (
        <div className="p-5">
          <p className="text-xs text-red-600 font-body">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="p-5 space-y-6">
          {/* Metrics Summary */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl bg-cream/30 dark:bg-navy/30 border border-cream-dark dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-navy/50 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wider font-heading">
                  Ping-Pongs
                </p>
                <p className="text-lg font-bold text-electric font-heading mt-0.5">
                  {metrics.ping_pong_count}
                </p>
              </div>
              <div className="rounded-xl bg-cream/30 dark:bg-navy/30 border border-cream-dark dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-navy/50 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wider font-heading">
                  Total Rev. Time
                </p>
                <p className="text-lg font-bold text-navy dark:text-slate-100 font-heading mt-0.5">
                  {formatDuration(metrics.total_revision_time_minutes)}
                </p>
              </div>
              <div className="rounded-xl bg-cream/30 dark:bg-navy/30 border border-cream-dark dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-navy/50 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wider font-heading">
                  Board Average
                </p>
                <p className="text-lg font-bold text-navy/60 dark:text-slate-300 font-heading mt-0.5">
                  {metrics.avg_board_ping_pong?.toFixed(2) ?? '-'}
                </p>
              </div>
              <div className="rounded-xl bg-cream/30 dark:bg-navy/30 border border-cream-dark dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-navy/50 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wider font-heading">
                  Status
                </p>
                <p className={`text-lg font-bold font-heading mt-0.5 ${metrics.is_outlier ? 'text-red-600' : 'text-green-600'}`}>
                  {metrics.is_outlier ? 'Outlier' : 'Normal'}
                </p>
              </div>
            </div>
          )}

          {/* Ping-Pong Visualization */}
          {pingPongPairs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-navy/70 dark:text-slate-300 font-heading mb-3">
                Ping-Pong Transitions ({pingPongPairs.length})
              </h4>
              <div className="space-y-2">
                {pingPongPairs.map((pair, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-body">
                    <span className="px-2 py-1 rounded bg-electric/10 text-electric font-medium whitespace-nowrap">
                      {pair.from.to_list_name ?? 'Work'}
                    </span>
                    <div className="flex items-center gap-1 text-navy/30 dark:text-slate-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
                      </svg>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                      </svg>
                    </div>
                    <span className="px-2 py-1 rounded bg-red-50 text-red-600 font-medium whitespace-nowrap">
                      {pair.to.to_list_name ?? 'Revision'}
                    </span>
                    <span className="text-navy/40 dark:text-slate-500 ml-2">
                      {formatDateTime(pair.to.moved_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Revision Time Breakdown */}
          {revisionStints.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-navy/70 dark:text-slate-300 font-heading mb-3">
                Revision Time Breakdown ({revisionStints.length} stint{revisionStints.length !== 1 ? 's' : ''})
              </h4>
              <div className="space-y-2">
                {revisionStints.map((stint, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-cream/30 dark:bg-navy/30 border border-cream-dark dark:border-slate-700">
                    <div className="flex items-center gap-3 text-xs font-body">
                      <span className="text-navy/50 dark:text-slate-400">Stint {i + 1}</span>
                      <span className="text-navy dark:text-slate-100">
                        {formatDateTime(stint.enteredAt)}
                      </span>
                      <span className="text-navy/30 dark:text-slate-600">to</span>
                      <span className="text-navy dark:text-slate-100">
                        {stint.exitedAt ? formatDateTime(stint.exitedAt) : 'Ongoing'}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-electric font-body">
                      {formatDuration(stint.durationMinutes)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Column History Timeline */}
          <div>
            <h4 className="text-xs font-semibold text-navy/70 dark:text-slate-300 font-heading mb-3">
              Column History ({history.length} moves)
            </h4>
            {history.length > 0 ? (
              <div className="relative pl-6 space-y-3">
                <div className="absolute left-2.5 top-1 bottom-1 w-px bg-cream-dark dark:bg-slate-700" />
                {history.map((entry, i) => {
                  const type = classifyColumn(entry.to_list_name);
                  const dotColor =
                    type === 'revision'
                      ? 'bg-red-400'
                      : type === 'work'
                      ? 'bg-electric'
                      : 'bg-navy/20 dark:bg-slate-700';

                  return (
                    <div key={entry.id ?? i} className="relative flex items-start gap-3">
                      <div className={`absolute left-[-18px] top-1.5 w-2 h-2 rounded-full ${dotColor}`} />
                      <div className="text-xs font-body">
                        <div className="flex items-center gap-2">
                          {entry.from_list_name && (
                            <>
                              <span className="text-navy/50 dark:text-slate-400">{entry.from_list_name}</span>
                              <span className="text-navy/30 dark:text-slate-600">-&gt;</span>
                            </>
                          )}
                          <span className={`font-medium ${type === 'revision' ? 'text-red-600' : type === 'work' ? 'text-electric' : 'text-navy dark:text-slate-100'}`}>
                            {entry.to_list_name ?? 'Unknown'}
                          </span>
                        </div>
                        <p className="text-[10px] text-navy/40 dark:text-slate-500 mt-0.5">
                          {formatDateTime(entry.moved_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">No column history available</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
