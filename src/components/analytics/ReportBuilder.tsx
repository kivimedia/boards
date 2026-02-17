'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CustomReport, ReportType } from '@/lib/types';

const REPORT_TYPES: { value: ReportType; label: string; description: string }[] = [
  { value: 'burndown', label: 'Burndown', description: 'Track remaining work over time' },
  { value: 'velocity', label: 'Velocity', description: 'Cards completed per sprint/period' },
  { value: 'cycle_time', label: 'Cycle Time', description: 'Average time from start to completion' },
  { value: 'workload', label: 'Workload', description: 'Task distribution across team members' },
  { value: 'ai_effectiveness', label: 'AI Effectiveness', description: 'AI usage, accuracy, and cost metrics' },
  { value: 'custom', label: 'Custom', description: 'Build a report with custom parameters' },
];

const SCHEDULE_OPTIONS = [
  { value: '', label: 'No schedule' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function ReportBuilder() {
  const [reports, setReports] = useState<CustomReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [reportType, setReportType] = useState<ReportType>('burndown');
  const [boardId, setBoardId] = useState('');
  const [dateRange, setDateRange] = useState('30');
  const [schedule, setSchedule] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/custom-reports');
      const json = await res.json();
      if (json.data) setReports(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const config: Record<string, unknown> = {
        board_id: boardId || undefined,
        date_range_days: parseInt(dateRange, 10) || 30,
      };

      if (editingId) {
        const res = await fetch(`/api/custom-reports/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            config,
            is_shared: isShared,
            schedule: schedule || null,
          }),
        });
        const json = await res.json();
        if (json.data) {
          setReports((prev) => prev.map((r) => (r.id === editingId ? json.data : r)));
        }
      } else {
        const res = await fetch('/api/custom-reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            report_type: reportType,
            config,
            is_shared: isShared,
            schedule: schedule || undefined,
          }),
        });
        const json = await res.json();
        if (json.data) {
          setReports((prev) => [json.data, ...prev]);
        }
      }
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (report: CustomReport) => {
    setEditingId(report.id);
    setName(report.name);
    setDescription(report.description ?? '');
    setReportType(report.report_type);
    setBoardId((report.config as Record<string, unknown>).board_id as string ?? '');
    setDateRange(String((report.config as Record<string, unknown>).date_range_days ?? '30'));
    setSchedule(report.schedule ?? '');
    setIsShared(report.is_shared);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/custom-reports/${id}`, { method: 'DELETE' });
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName('');
    setDescription('');
    setReportType('burndown');
    setBoardId('');
    setDateRange('30');
    setSchedule('');
    setIsShared(false);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-cream-dark/40 dark:bg-slate-800/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Custom Reports</h3>
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors"
        >
          + New Report
        </button>
      </div>

      {/* Report builder form */}
      {showForm && (
        <div className="rounded-xl border border-electric/20 bg-electric/5 p-5 space-y-4">
          <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
            {editingId ? 'Edit Report' : 'Create Report'}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Report Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                placeholder="Sprint Burndown Report"
              />
            </div>

            {!editingId && (
              <div>
                <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                  Report Type
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as ReportType)}
                  className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                >
                  {REPORT_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 resize-none"
              placeholder="Optional description..."
            />
          </div>

          {/* Type-specific info */}
          {!editingId && (
            <div className="rounded-lg bg-white/60 p-3">
              <p className="text-xs text-navy/50 font-body">
                {REPORT_TYPES.find((t) => t.value === reportType)?.description}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Board ID (optional)
              </label>
              <input
                type="text"
                value={boardId}
                onChange={(e) => setBoardId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                placeholder="Filter by board"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Date Range (days)
              </label>
              <input
                type="number"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                min="1"
                max="365"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Schedule
              </label>
              <select
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              >
                {SCHEDULE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="rounded border-cream-dark text-electric focus:ring-electric/30"
            />
            <span className="text-xs font-body text-navy/70 dark:text-slate-300">Share with team</span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || !name.trim()}
              className="px-4 py-2 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-lg text-xs font-medium font-body bg-cream-dark dark:bg-slate-700 text-navy/60 dark:text-slate-300 hover:bg-cream-dark/80 dark:hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reports list */}
      {reports.length === 0 && !showForm ? (
        <div className="text-center py-12">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body mb-2">No reports created yet.</p>
          <p className="text-xs text-navy/30 dark:text-slate-500 font-body">
            Create custom reports to track burndown, velocity, workload, and more.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-4 flex items-center justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading truncate">
                    {report.name}
                  </h4>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-electric/10 text-electric font-body">
                    {report.report_type}
                  </span>
                  {report.is_shared && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-600 font-body">
                      shared
                    </span>
                  )}
                  {report.schedule && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-600 font-body">
                      {report.schedule}
                    </span>
                  )}
                </div>
                {report.description && (
                  <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-1 truncate">{report.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => handleEdit(report)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-cream-dark dark:bg-slate-700 hover:bg-cream-dark/80 dark:hover:bg-slate-600 text-navy/60 dark:text-slate-300 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(report.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
