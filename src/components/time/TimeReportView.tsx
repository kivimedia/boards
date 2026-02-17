'use client';

import { useState, useCallback } from 'react';
import type { TimeEntry, TimeReport } from '@/lib/types';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

function getDefaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0];
}

export default function TimeReportView() {
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [userId, setUserId] = useState('');
  const [boardId, setBoardId] = useState('');
  const [clientId, setClientId] = useState('');
  const [report, setReport] = useState<TimeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });
      if (userId.trim()) params.set('user_id', userId.trim());
      if (boardId.trim()) params.set('board_id', boardId.trim());
      if (clientId.trim()) params.set('client_id', clientId.trim());

      const res = await fetch(`/api/time-reports?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load report');
      }
      const json = await res.json();
      setReport(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, userId, boardId, clientId]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });
      if (userId.trim()) params.set('user_id', userId.trim());
      if (boardId.trim()) params.set('board_id', boardId.trim());
      if (clientId.trim()) params.set('client_id', clientId.trim());

      const res = await fetch(`/api/time-reports/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `time-report_${startDate}_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  }, [startDate, endDate, userId, boardId, clientId]);

  const billablePercent = report && report.totalMinutes > 0
    ? Math.round((report.billableMinutes / report.totalMinutes) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Report Filters</h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-bg text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-bg text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">User ID</label>
              <input
                type="text"
                placeholder="Filter by user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-bg text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Board ID</label>
              <input
                type="text"
                placeholder="Filter by board"
                value={boardId}
                onChange={(e) => setBoardId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-bg text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Client ID</label>
              <input
                type="text"
                placeholder="Filter by client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-bg text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={fetchReport}
              disabled={loading}
              className={`
                px-4 py-2 rounded-xl text-sm font-semibold font-body bg-electric text-white
                hover:bg-electric/90 transition-all duration-200
                ${loading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {loading ? 'Loading...' : 'Generate Report'}
            </button>
            {report && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className={`
                  px-4 py-2 rounded-xl text-sm font-semibold font-body border border-cream-dark dark:border-slate-700 text-navy dark:text-slate-100
                  hover:bg-cream-dark dark:hover:bg-slate-800 transition-all duration-200
                  ${exporting ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            )}
          </div>
          {error && <p className="text-xs text-red-600 font-body mt-2">{error}</p>}
        </div>
      </div>

      {/* Report results */}
      {report && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm">
              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                Total Time
              </p>
              <p className="text-2xl font-bold text-navy dark:text-slate-100 font-heading mt-1">
                {formatHours(report.totalMinutes)}h
              </p>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">{formatDuration(report.totalMinutes)}</p>
            </div>
            <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm">
              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                Billable
              </p>
              <p className="text-2xl font-bold text-electric font-heading mt-1">
                {formatHours(report.billableMinutes)}h
              </p>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">{billablePercent}% of total</p>
            </div>
            <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm">
              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                Non-Billable
              </p>
              <p className="text-2xl font-bold text-navy/60 dark:text-slate-300 font-heading mt-1">
                {formatHours(report.nonBillableMinutes)}h
              </p>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">{100 - billablePercent}% of total</p>
            </div>
            <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm">
              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                Entries
              </p>
              <p className="text-2xl font-bold text-navy dark:text-slate-100 font-heading mt-1">
                {report.entries.length}
              </p>
            </div>
          </div>

          {/* Breakdown by User */}
          {report.byUser && Object.keys(report.byUser).length > 0 && (
            <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
                <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">By User</h3>
              </div>
              <div className="p-5 space-y-3">
                {Object.entries(report.byUser).map(([uid, mins]) => {
                  const maxMins = Math.max(...Object.values(report.byUser!));
                  const pct = maxMins > 0 ? Math.round((mins / maxMins) * 100) : 0;
                  return (
                    <div key={uid}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-navy/70 dark:text-slate-300 font-body truncate">{uid}</span>
                        <span className="text-xs font-semibold text-navy dark:text-slate-100 font-body">{formatDuration(mins)}</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-cream-dark dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-electric transition-all duration-500"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Entry table */}
          <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
              <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Entries</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-body">
                <thead>
                  <tr className="border-b border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30">
                    <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Description</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Duration</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Billable</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Card</th>
                  </tr>
                </thead>
                <tbody>
                  {report.entries.map((entry: TimeEntry) => (
                    <tr key={entry.id} className="border-b border-cream-dark/50 dark:border-slate-700/50 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5 text-navy dark:text-slate-100 whitespace-nowrap">
                        {entry.started_at.split('T')[0]}
                      </td>
                      <td className="px-4 py-2.5 text-navy dark:text-slate-100 truncate max-w-[200px]">
                        {entry.description || '-'}
                      </td>
                      <td className="px-4 py-2.5 text-navy dark:text-slate-100 font-medium">
                        {entry.duration_minutes ? formatDuration(entry.duration_minutes) : '-'}
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.is_billable ? (
                          <span className="px-1.5 py-0.5 rounded bg-electric/10 text-electric font-medium">Yes</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-navy/5 dark:bg-slate-800 text-navy/40 dark:text-slate-500 font-medium">No</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-navy/50 dark:text-slate-400 font-mono text-[10px]">
                        {entry.card_id.substring(0, 8)}
                      </td>
                    </tr>
                  ))}
                  {report.entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-navy/40 dark:text-slate-500">
                        No entries found for this date range
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
