'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ProductivityReportFile } from '@/lib/types';
import Button from '@/components/ui/Button';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
  generating: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Generating' },
  completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
  failed: { bg: 'bg-red-100', text: 'text-red-800', label: 'Failed' },
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function ReportFileList() {
  const [files, setFiles] = useState<ProductivityReportFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Generate form state
  const [showGenerate, setShowGenerate] = useState(false);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [generating, setGenerating] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/productivity/reports');
      const json = await res.json();
      if (json.data) setFiles(json.data);
    } catch {
      showToast('error', 'Failed to load report files.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleGenerate = async () => {
    if (!dateStart || !dateEnd) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/productivity/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRangeStart: dateStart,
          dateRangeEnd: dateEnd,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate report');
      showToast('success', 'Report generation started.');
      setShowGenerate(false);
      setDateStart('');
      setDateEnd('');
      await fetchFiles();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading reports...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm ${
          toast.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">Generated Reports</h3>
          <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5">
            View and download previously generated productivity reports
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowGenerate(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Generate Report
        </Button>
      </div>

      {/* Generate Form */}
      {showGenerate && (
        <div className="rounded-2xl border-2 border-electric/20 dark:border-electric/30 bg-white dark:bg-dark-surface p-6 shadow-sm">
          <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-4">Generate New Report</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Start Date</label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">End Date</label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              loading={generating}
              disabled={!dateStart || !dateEnd}
              onClick={handleGenerate}
            >
              Generate
            </Button>
          </div>
        </div>
      )}

      {/* Files Table */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        {files.length === 0 ? (
          <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
            No reports generated yet. Click &quot;Generate Report&quot; to create one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading uppercase tracking-wider">Format</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading uppercase tracking-wider">Date Range</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading uppercase tracking-wider">Size</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading uppercase tracking-wider">Created</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-dark dark:divide-slate-700">
                {files.map((file) => {
                  const status = STATUS_STYLES[file.status] || STATUS_STYLES.pending;
                  return (
                    <tr key={file.id} className="hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 text-navy dark:text-slate-100 font-body">{file.report_type}</td>
                      <td className="px-5 py-3 text-navy dark:text-slate-100 font-body uppercase">{file.format}</td>
                      <td className="px-5 py-3 text-navy/70 dark:text-slate-300 font-body text-xs">
                        {formatDate(file.date_range_start)} - {formatDate(file.date_range_end)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-navy/50 dark:text-slate-400 font-body text-xs">{formatFileSize(file.file_size_bytes)}</td>
                      <td className="px-5 py-3 text-navy/50 dark:text-slate-400 font-body text-xs">{formatDate(file.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        {file.status === 'completed' && file.storage_path && (
                          <a
                            href={file.storage_path}
                            className="text-electric hover:text-electric/80 text-xs font-medium font-body"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Download
                          </a>
                        )}
                        {file.status === 'failed' && file.error_message && (
                          <span className="text-red-500 text-xs font-body" title={file.error_message}>
                            Error
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
