'use client';

import { useState, useEffect, useCallback } from 'react';
import type { LIJob, LIJobType, LIJobStatus } from '@/lib/types';

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300', label: 'Pending' },
  RUNNING: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300', label: 'Running' },
  COMPLETED: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300', label: 'Done' },
  FAILED: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-700 dark:text-red-300', label: 'Failed' },
  CANCELLED: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-400 line-through', label: 'Cancelled' },
};

const JOB_TYPE_LABELS: Record<string, string> = {
  SCOUT_IMPORT: 'Import',
  SCOUT_ENRICH: 'Enrich',
  QUALIFY: 'Qualify',
  GENERATE_OUTREACH: 'Gen Messages',
  WEB_RESEARCH: 'Research',
  PERSONALIZE_MESSAGE: 'Personalize',
  FOLLOW_UP_CHECK: 'Follow-ups',
  RECOVERY: 'Recovery',
  FEEDBACK_COLLECT: 'Feedback',
  AB_EVALUATE: 'A/B Eval',
  PURGE_TRASH: 'Purge',
};

export default function JobQueueAdmin() {
  const [jobs, setJobs] = useState<LIJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('job_type', filterType);

      const res = await fetch(`/api/outreach/jobs?${params}`);
      const json = await res.json();
      if (res.ok) {
        setJobs(json.data?.jobs || []);
        setTotal(json.data?.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterType]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Auto-refresh when jobs are running
  useEffect(() => {
    const hasRunning = jobs.some(j => j.status === 'RUNNING');
    if (!hasRunning) return;

    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [jobs, fetchJobs]);

  const handleAction = async (jobId: string, action: 'cancel' | 'retry') => {
    const res = await fetch(`/api/outreach/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (res.ok) fetchJobs();
  };

  const formatDuration = (job: LIJob): string => {
    if (!job.started_at) return '-';
    const end = job.completed_at ? new Date(job.completed_at) : new Date();
    const ms = end.getTime() - new Date(job.started_at).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTime = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 items-center">
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 dark:border-navy-700 rounded-lg px-3 py-2 bg-white dark:bg-navy-800 text-navy dark:text-white"
        >
          <option value="">All Statuses</option>
          {Object.keys(STATUS_BADGES).map(s => (
            <option key={s} value={s}>{STATUS_BADGES[s].label}</option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 dark:border-navy-700 rounded-lg px-3 py-2 bg-white dark:bg-navy-800 text-navy dark:text-white"
        >
          <option value="">All Types</option>
          {Object.entries(JOB_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <span className="text-xs text-navy/40 dark:text-slate-500 ml-auto">
          {total} total jobs
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-navy-800 rounded-lg border border-gray-200 dark:border-navy-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-navy-700 bg-gray-50 dark:bg-navy-900">
                <th className="text-left px-3 py-2 font-medium text-navy/50 dark:text-slate-400">Type</th>
                <th className="text-left px-3 py-2 font-medium text-navy/50 dark:text-slate-400">Status</th>
                <th className="text-left px-3 py-2 font-medium text-navy/50 dark:text-slate-400">Priority</th>
                <th className="text-left px-3 py-2 font-medium text-navy/50 dark:text-slate-400">Attempts</th>
                <th className="text-left px-3 py-2 font-medium text-navy/50 dark:text-slate-400">Created</th>
                <th className="text-left px-3 py-2 font-medium text-navy/50 dark:text-slate-400">Duration</th>
                <th className="text-right px-3 py-2 font-medium text-navy/50 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const badge = STATUS_BADGES[job.status] || STATUS_BADGES.PENDING;
                const isExpanded = expandedId === job.id;

                return (
                  <tr key={job.id} className="group">
                    <td colSpan={7} className="p-0">
                      <div
                        className="flex items-center px-3 py-2.5 border-b border-gray-50 dark:border-navy-700/50 hover:bg-gray-50 dark:hover:bg-navy-750 cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : job.id)}
                      >
                        <div className="flex-1 grid grid-cols-7 items-center gap-2">
                          <span className="text-navy dark:text-white font-medium">
                            {JOB_TYPE_LABELS[job.job_type] || job.job_type}
                          </span>
                          <span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text} ${
                              job.status === 'RUNNING' ? 'animate-pulse' : ''
                            }`}>
                              {badge.label}
                            </span>
                          </span>
                          <span className="text-navy/50 dark:text-slate-400">P{job.priority}</span>
                          <span className="text-navy/50 dark:text-slate-400">{job.attempts}/{job.max_attempts}</span>
                          <span className="text-navy/50 dark:text-slate-400 text-xs">{formatTime(job.created_at)}</span>
                          <span className="text-navy/50 dark:text-slate-400">{formatDuration(job)}</span>
                          <div className="text-right flex gap-1 justify-end">
                            {job.status === 'FAILED' && (
                              <button
                                onClick={e => { e.stopPropagation(); handleAction(job.id, 'retry'); }}
                                className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300"
                              >
                                Retry
                              </button>
                            )}
                            {['PENDING', 'RUNNING'].includes(job.status) && (
                              <button
                                onClick={e => { e.stopPropagation(); handleAction(job.id, 'cancel'); }}
                                className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 py-3 bg-gray-50 dark:bg-navy-900 border-b border-gray-100 dark:border-navy-700 space-y-2">
                          {job.error_message && (
                            <div className="text-xs text-red-600 dark:text-red-400">
                              <span className="font-semibold">Error:</span> {job.error_message}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase">Payload</span>
                              <pre className="text-xs text-navy/70 dark:text-slate-300 mt-1 bg-white dark:bg-navy-800 rounded p-2 overflow-auto max-h-32">
                                {JSON.stringify(job.payload, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <span className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase">Result</span>
                              <pre className="text-xs text-navy/70 dark:text-slate-300 mt-1 bg-white dark:bg-navy-800 rounded p-2 overflow-auto max-h-32">
                                {JSON.stringify(job.result, null, 2)}
                              </pre>
                            </div>
                          </div>
                          <div className="text-[10px] text-navy/30 dark:text-slate-600">
                            ID: {job.id} {job.locked_by ? `| Worker: ${job.locked_by}` : ''}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-navy/40 dark:text-slate-500 text-sm">
                    No jobs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 25 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 dark:border-navy-700 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-navy/50 dark:text-slate-400 px-3 py-1.5">
            Page {page} of {Math.ceil(total / 25)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page * 25 >= total}
            className="text-sm px-3 py-1.5 rounded border border-gray-200 dark:border-navy-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
