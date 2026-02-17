'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RevisionReportExport, RevisionExportFormat } from '@/lib/types';

interface ExportManagerProps {
  boardId?: string;
}

const FORMAT_OPTIONS: { value: RevisionExportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
  { value: 'json', label: 'JSON' },
];

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-700';
    case 'generating':
      return 'bg-electric/10 text-electric';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-navy/5 text-navy/50 dark:text-slate-400';
  }
}

function getDefaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0];
}

export default function ExportManager({ boardId }: ExportManagerProps) {
  const [exports, setExports] = useState<RevisionReportExport[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [format, setFormat] = useState<RevisionExportFormat>('csv');
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [department, setDepartment] = useState('');

  const fetchExports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (boardId) params.set('board_id', boardId);

      const res = await fetch(`/api/revision-exports?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setExports(json.data ?? []);
      }
    } catch {
      // silent fail on list fetch
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchExports();
  }, [fetchExports]);

  const handleCreateExport = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/revision-exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: boardId || undefined,
          department: department.trim() || undefined,
          date_range_start: startDate,
          date_range_end: endDate,
          format,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create export');
      }

      await fetchExports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create export');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (exportId: string) => {
    try {
      const res = await fetch(`/api/revision-exports/${exportId}`);
      if (!res.ok) throw new Error('Failed to fetch export details');
      const json = await res.json();
      const downloadUrl = json.data?.download_url;
      if (downloadUrl) {
        window.open(downloadUrl, '_blank');
      }
    } catch {
      setError('Failed to download export');
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Export Form */}
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Request Export</h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as RevisionExportFormat)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              >
                {FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Department</label>
              <input
                type="text"
                placeholder="Optional"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={handleCreateExport}
              disabled={creating || !startDate || !endDate}
              className={`
                px-4 py-2 rounded-xl text-sm font-semibold font-body bg-electric text-white
                hover:bg-electric/90 transition-all duration-200
                ${creating || !startDate || !endDate ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {creating ? 'Creating...' : 'Create Export'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 font-body mt-2">{error}</p>}
        </div>
      </div>

      {/* Exports List */}
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Past Exports</h3>
          <button
            onClick={fetchExports}
            disabled={loading}
            className="text-xs text-electric font-body hover:underline"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="border-b border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30">
                <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Date Range</th>
                <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Format</th>
                <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Status</th>
                <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Size</th>
                <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Created</th>
                <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((exp) => (
                <tr key={exp.id} className="border-b border-cream-dark/50 dark:border-slate-700/50 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-navy dark:text-slate-100 whitespace-nowrap">
                    {exp.date_range_start} to {exp.date_range_end}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-1.5 py-0.5 rounded bg-navy/5 dark:bg-slate-700 text-navy/60 dark:text-slate-400 font-medium uppercase">
                      {exp.format}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] ${getStatusBadgeClasses(exp.status)}`}>
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-navy/50 dark:text-slate-400">
                    {exp.file_size_bytes
                      ? `${(exp.file_size_bytes / 1024).toFixed(1)} KB`
                      : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-navy/50 dark:text-slate-400 whitespace-nowrap">
                    {new Date(exp.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5">
                    {exp.status === 'completed' && exp.storage_path && (
                      <button
                        onClick={() => handleDownload(exp.id)}
                        className="text-electric hover:underline font-medium"
                      >
                        Download
                      </button>
                    )}
                    {exp.status === 'failed' && exp.error_message && (
                      <span className="text-red-500" title={exp.error_message}>
                        Error
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {exports.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-navy/40 dark:text-slate-500">
                    No exports yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
