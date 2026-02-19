'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { MigrationJob, MigrationProgress, MigrationReport as MigrationReportType } from '@/lib/types';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  running: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Running' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', label: 'Completed' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Cancelled' },
};

export default function MigrationHistory() {
  const [jobs, setJobs] = useState<MigrationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [backfillingId, setBackfillingId] = useState<string | null>(null);
  const [backfillProgress, setBackfillProgress] = useState<MigrationProgress | null>(null);
  const [backfillReport, setBackfillReport] = useState<MigrationReportType | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Re-import state
  const [reimportJobId, setReimportJobId] = useState<string | null>(null);
  const [reimportBoardIds, setReimportBoardIds] = useState<Set<string>>(new Set());
  const [reimporting, setReimporting] = useState(false);
  const [reimportError, setReimportError] = useState('');

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/migration/jobs');
      const json = await res.json();
      if (json.data) setJobs(json.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Poll for backfill progress
  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/migration/jobs');
        const json = await res.json();
        if (json.data) {
          setJobs(json.data);
          const job = json.data.find((j: MigrationJob) => j.id === jobId);
          if (job) {
            const progress = job.progress as MigrationProgress | null;
            const report = job.report as MigrationReportType | null;
            if (progress) setBackfillProgress(progress);
            if (report) setBackfillReport(report);

            // Stop polling when backfill is done
            if (progress?.phase === 'backfill_complete') {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              // Keep modal open for a moment so user sees the result
              setTimeout(() => {
                setBackfillingId(null);
                setBackfillProgress(null);
                setBackfillReport(null);
              }, 5000);
            }
          }
        }
      } catch {
        // silently fail
      }
    }, 2000);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleDelete = async (jobId: string) => {
    setDeletingId(jobId);
    try {
      const res = await fetch(`/api/migration/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        if (expandedId === jobId) setExpandedId(null);
      }
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const handleBackfillAttachments = async (jobId: string) => {
    setBackfillingId(jobId);
    setBackfillProgress({ current: 0, total: 0, phase: 'backfilling_attachments', detail: 'Starting...' });
    setBackfillReport(null);

    try {
      // Fire-and-forget the streaming request (keeps server alive)
      fetch(`/api/migration/jobs/${jobId}/backfill-attachments`, {
        method: 'POST',
      }).catch(() => {});

      // Start polling for progress
      startPolling(jobId);
    } catch {
      setBackfillingId(null);
      setBackfillProgress(null);
    }
  };

  const handleStartReimport = async (job: MigrationJob) => {
    if (reimportBoardIds.size === 0) return;
    setReimporting(true);
    setReimportError('');

    try {
      const config = {
        ...job.config,
        board_ids: Array.from(reimportBoardIds),
      };

      const createRes = await fetch('/api/migration/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      const createJson = await createRes.json();
      if (!createRes.ok) {
        setReimportError(createJson.error || 'Failed to create re-import job');
        return;
      }

      const newJob = createJson.data as MigrationJob;

      // Fire the streaming run (don't await)
      fetch(`/api/migration/jobs/${newJob.id}/run`, { method: 'POST' }).catch(() => {});

      // Reset state and refresh jobs list
      setReimportJobId(null);
      setReimportBoardIds(new Set());
      fetchJobs();

      // Show a notification
      alert(`Re-import started for ${reimportBoardIds.size} board(s). Check migration history for progress.`);
    } catch {
      setReimportError('Network error. Please try again.');
    } finally {
      setReimporting(false);
    }
  };

  const toggleReimportBoard = (boardId: string) => {
    setReimportBoardIds((prev) => {
      const next = new Set(prev);
      if (next.has(boardId)) {
        next.delete(boardId);
      } else {
        next.add(boardId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-cream-dark dark:bg-slate-700 rounded w-40" />
          <div className="h-12 bg-cream dark:bg-navy rounded-xl" />
          <div className="h-12 bg-cream dark:bg-navy rounded-xl" />
        </div>
      </div>
    );
  }

  if (jobs.length === 0) return null;

  return (
    <>
      {/* Backfill Progress Modal */}
      {backfillingId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 max-w-lg w-full shadow-xl space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-heading font-bold text-navy dark:text-slate-100">
                {backfillProgress?.phase === 'backfill_complete' ? 'Backfill Complete' : 'Backfilling Attachments'}
              </h3>
              <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-1">
                {backfillProgress?.phase === 'backfill_complete'
                  ? 'Attachment import finished.'
                  : 'Runs on the server — safe to close this popup.'}
              </p>
            </div>

            {/* Progress bar */}
            {backfillProgress && backfillProgress.total > 0 && (
              <div>
                <div className="flex justify-between text-xs text-navy/50 dark:text-slate-400 font-body mb-1">
                  <span>Board {backfillProgress.current}/{backfillProgress.total}</span>
                  <span>{Math.round((backfillProgress.current / backfillProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-cream dark:bg-navy rounded-full h-2">
                  <div
                    className="bg-electric h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((backfillProgress.current / backfillProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Detail text */}
            {backfillProgress?.detail && (
              <div className="bg-cream dark:bg-navy rounded-lg px-3 py-2">
                <p className="text-xs font-mono text-navy/70 dark:text-slate-300 truncate">
                  {backfillProgress.detail}
                </p>
              </div>
            )}

            {/* Live counters */}
            {backfillReport && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-cream dark:bg-navy rounded-lg p-2 text-center">
                  <p className="text-lg font-heading font-bold text-navy dark:text-slate-100">
                    {backfillReport.attachments_created ?? 0}
                  </p>
                  <p className="text-[10px] font-body text-navy/40">Attachments Imported</p>
                </div>
                <div className="bg-cream dark:bg-navy rounded-lg p-2 text-center">
                  <p className="text-lg font-heading font-bold text-navy dark:text-slate-100">
                    {backfillReport.errors?.length ?? 0}
                  </p>
                  <p className="text-[10px] font-body text-navy/40">Errors</p>
                </div>
              </div>
            )}

            {/* Spinner or checkmark */}
            <div className="flex justify-center">
              {backfillProgress?.phase === 'backfill_complete' ? (
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              ) : (
                <svg className="animate-spin h-6 w-6 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
            </div>

            {/* Close button (always available) */}
            <button
              onClick={() => {
                setBackfillingId(null);
                setBackfillProgress(null);
                setBackfillReport(null);
                if (pollRef.current) {
                  clearInterval(pollRef.current);
                  pollRef.current = null;
                }
                fetchJobs();
              }}
              className="w-full text-sm text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 font-body transition-colors"
            >
              {backfillProgress?.phase === 'backfill_complete' ? 'Close' : 'Close (backfill continues on server)'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        <div className="p-5 border-b border-cream-dark dark:border-slate-700">
          <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">
            Migration History
          </h3>
        </div>

        <div className="divide-y divide-cream-dark dark:divide-slate-700">
          {jobs.map((job) => {
            const status = STATUS_STYLES[job.status] || STATUS_STYLES.pending;
            const report = job.report as MigrationReportType;
            const isExpanded = expandedId === job.id;

            return (
              <div key={job.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : job.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-cream/50 dark:hover:bg-slate-800/30 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">
                      {new Date(job.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                    {status.label}
                  </span>
                  <span className="text-xs text-navy/40 dark:text-slate-500 font-body whitespace-nowrap">
                    {report?.boards_created ?? 0} boards
                  </span>
                  <span className="text-xs text-navy/40 dark:text-slate-500 font-body whitespace-nowrap">
                    {report?.cards_created ?? 0} cards
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`text-navy/30 dark:text-slate-600 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Report Stats */}
                    {report && (
                      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                        {[
                          { label: 'Boards', value: report.boards_created },
                          { label: 'Lists', value: report.lists_created },
                          { label: 'Cards', value: report.cards_created },
                          { label: 'Comments', value: report.comments_created },
                          { label: 'Attachments', value: report.attachments_created },
                          { label: 'Labels', value: report.labels_created },
                          { label: 'Checklists', value: report.checklists_created },
                        ].map((stat) => (
                          <div key={stat.label} className="bg-cream dark:bg-navy rounded-lg p-2 text-center">
                            <p className="text-lg font-heading font-bold text-navy dark:text-slate-100">{stat.value ?? 0}</p>
                            <p className="text-[10px] font-body text-navy/40">{stat.label}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {report && ((report.positions_synced ?? 0) > 0 || (report.placements_removed ?? 0) > 0 || (report.covers_resolved ?? 0) > 0) && (
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Pos Synced', value: report.positions_synced },
                          { label: 'Stale Removed', value: report.placements_removed },
                          { label: 'Covers Fixed', value: report.covers_resolved },
                        ].map((stat) => (
                          <div key={stat.label} className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-2 text-center">
                            <p className="text-lg font-heading font-bold text-blue-700 dark:text-blue-300">{stat.value ?? 0}</p>
                            <p className="text-[10px] font-body text-blue-500/60">{stat.label}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Errors */}
                    {report?.errors && report.errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                        <p className="text-xs font-medium text-red-700">
                          {report.errors.length} error{report.errors.length !== 1 ? 's' : ''}
                        </p>
                        {report.errors.slice(0, 5).map((err, i) => (
                          <p key={i} className="text-xs text-red-600">{err}</p>
                        ))}
                        {report.errors.length > 5 && (
                          <p className="text-xs text-red-400">
                            ...and {report.errors.length - 5} more
                          </p>
                        )}
                      </div>
                    )}

                    {/* Error Message */}
                    {job.error_message && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-xs text-red-600">{job.error_message}</p>
                      </div>
                    )}

                    {/* Re-import board selector */}
                    {reimportJobId === job.id && (
                      <div className="bg-cream dark:bg-navy rounded-xl p-4 space-y-3">
                        <p className="text-xs font-semibold text-navy/70 dark:text-slate-300">
                          Select boards to re-import (already-imported items will be skipped):
                        </p>
                        <div className="space-y-1.5">
                          {(job.config.board_ids || []).map((bid) => (
                            <label key={bid} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={reimportBoardIds.has(bid)}
                                onChange={() => toggleReimportBoard(bid)}
                                className="rounded border-cream-dark text-electric focus:ring-electric/30"
                              />
                              <span className="text-xs font-body text-navy dark:text-slate-300 font-mono truncate">
                                {bid}
                              </span>
                            </label>
                          ))}
                        </div>
                        {reimportError && (
                          <p className="text-xs text-red-600">{reimportError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleStartReimport(job)}
                            disabled={reimportBoardIds.size === 0 || reimporting}
                            className="px-3 py-1.5 bg-electric text-white rounded-lg font-heading font-semibold text-xs hover:bg-electric/90 disabled:opacity-50 transition-colors"
                          >
                            {reimporting ? 'Starting...' : `Re-import ${reimportBoardIds.size} board(s)`}
                          </button>
                          <button
                            onClick={() => { setReimportJobId(null); setReimportBoardIds(new Set()); setReimportError(''); }}
                            className="px-3 py-1.5 text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 rounded-lg font-body text-xs transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    {['completed', 'failed', 'cancelled'].includes(job.status) && (
                      <div className="flex justify-between items-center">
                        <div className="flex gap-4">
                          {['completed', 'failed'].includes(job.status) && (
                            <>
                              <button
                                onClick={() => handleBackfillAttachments(job.id)}
                                disabled={!!backfillingId}
                                className="text-xs text-electric hover:text-electric/80 font-medium disabled:opacity-50 transition-colors flex items-center gap-1.5"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Backfill Attachments
                              </button>
                              <button
                                onClick={() => {
                                  setReimportJobId(reimportJobId === job.id ? null : job.id);
                                  setReimportBoardIds(new Set());
                                  setReimportError('');
                                }}
                                disabled={reimporting}
                                className="text-xs text-electric hover:text-electric/80 font-medium disabled:opacity-50 transition-colors flex items-center gap-1.5"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="23 4 23 10 17 10" />
                                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                                Re-import Boards
                              </button>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(job.id)}
                          disabled={deletingId === job.id}
                          className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
                        >
                          {deletingId === job.id ? 'Deleting...' : 'Delete Job'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
