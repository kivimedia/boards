'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ScheduledReport } from '@/lib/types';

interface ScheduledReportManagerProps {
  initialReports?: ScheduledReport[];
}

const REPORT_TYPES = [
  { value: 'productivity', label: 'Productivity' },
  { value: 'revision', label: 'Revision' },
  { value: 'burndown', label: 'Burndown' },
  { value: 'custom', label: 'Custom' },
];

const SCHEDULE_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly:monday', label: 'Weekly (Monday)' },
  { value: 'weekly:friday', label: 'Weekly (Friday)' },
  { value: 'monthly:1', label: 'Monthly (1st)' },
  { value: 'monthly:15', label: 'Monthly (15th)' },
];

export default function ScheduledReportManager({ initialReports }: ScheduledReportManagerProps) {
  const [reports, setReports] = useState<ScheduledReport[]>(initialReports ?? []);
  const [loading, setLoading] = useState(!initialReports);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('productivity');
  const [formSchedule, setFormSchedule] = useState('daily');
  const [formRecipients, setFormRecipients] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scheduled-reports');
      if (!res.ok) throw new Error('Failed to load reports');
      const json = await res.json();
      setReports(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialReports) {
      fetchReports();
    }
  }, [initialReports, fetchReports]);

  const resetForm = () => {
    setFormName('');
    setFormType('productivity');
    setFormSchedule('daily');
    setFormRecipients('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formRecipients.trim()) {
      setError('Name and recipients are required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const recipients = formRecipients.split(',').map((r) => r.trim()).filter(Boolean);
      const res = await fetch('/api/scheduled-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          report_type: formType,
          schedule: formSchedule,
          recipients,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create report');
      }
      const json = await res.json();
      setReports((prev) => [json.data, ...prev]);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !formName.trim() || !formRecipients.trim()) {
      setError('Name and recipients are required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const recipients = formRecipients.split(',').map((r) => r.trim()).filter(Boolean);
      const res = await fetch(`/api/scheduled-reports/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          schedule: formSchedule,
          recipients,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update report');
      }
      const json = await res.json();
      setReports((prev) =>
        prev.map((r) => (r.id === editingId ? json.data : r))
      );
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update report');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (report: ScheduledReport) => {
    try {
      const res = await fetch(`/api/scheduled-reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !report.is_active }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      const json = await res.json();
      setReports((prev) => prev.map((r) => (r.id === report.id ? json.data : r)));
    } catch {
      setError('Failed to toggle report status');
    }
  };

  const handleDelete = async (reportId: string) => {
    try {
      const res = await fetch(`/api/scheduled-reports/${reportId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch {
      setError('Failed to delete report');
    }
  };

  const startEdit = (report: ScheduledReport) => {
    setFormName(report.name);
    setFormType(report.report_type);
    setFormSchedule(report.schedule);
    setFormRecipients(report.recipients.join(', '));
    setEditingId(report.id);
    setShowForm(true);
  };

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Scheduled Reports</h3>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold font-body bg-electric text-white hover:bg-electric/90 transition-all duration-200"
        >
          {showForm ? 'Cancel' : 'New Report'}
        </button>
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-600 font-body">{error}</p>
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="p-5 border-b border-cream-dark dark:border-slate-700 bg-cream/20 dark:bg-navy/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Report Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Weekly Team Productivity"
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Report Type
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                disabled={!!editingId}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric disabled:opacity-50"
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Schedule
              </label>
              <select
                value={formSchedule}
                onChange={(e) => setFormSchedule(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              >
                {SCHEDULE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Recipients (comma-separated emails)
              </label>
              <input
                type="text"
                value={formRecipients}
                onChange={(e) => setFormRecipients(e.target.value)}
                placeholder="team@example.com, lead@example.com"
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={saving}
              className={`
                px-4 py-2 rounded-xl text-sm font-semibold font-body bg-electric text-white
                hover:bg-electric/90 transition-all duration-200
                ${saving ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {saving ? 'Saving...' : editingId ? 'Update Report' : 'Create Report'}
            </button>
          </div>
        </div>
      )}

      {/* Report List */}
      {loading ? (
        <div className="p-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="h-4 w-32 bg-cream-dark dark:bg-slate-700 rounded" />
              <div className="flex-1" />
              <div className="h-4 w-16 bg-cream-dark dark:bg-slate-700 rounded" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="p-8 text-center text-navy/40 dark:text-slate-500 text-sm font-body">
          No scheduled reports yet
        </div>
      ) : (
        <div className="divide-y divide-cream-dark/50 dark:divide-slate-700/50">
          {reports.map((report) => (
            <div
              key={report.id}
              className="px-5 py-4 flex flex-wrap items-center gap-3 hover:bg-cream/20 dark:hover:bg-slate-800/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                  {report.name}
                </p>
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
                  {report.report_type} &middot; {report.schedule} &middot;{' '}
                  {report.recipients.length} recipient{report.recipients.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Active toggle */}
              <button
                onClick={() => handleToggleActive(report)}
                className={`
                  relative w-9 h-5 rounded-full transition-colors duration-200
                  ${report.is_active ? 'bg-emerald-500' : 'bg-cream-dark dark:bg-slate-700'}
                `}
              >
                <span
                  className={`
                    absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200
                    ${report.is_active ? 'translate-x-4' : 'translate-x-0.5'}
                  `}
                />
              </button>

              {/* Edit */}
              <button
                onClick={() => startEdit(report)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium font-body text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
              >
                Edit
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete(report.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium font-body text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
