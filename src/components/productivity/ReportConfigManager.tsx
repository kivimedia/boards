'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ProductivityReportConfig, ProductivityReportType, ProductivityReportFormat } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const REPORT_TYPE_OPTIONS: { value: ProductivityReportType; label: string }[] = [
  { value: 'individual', label: 'Individual Report' },
  { value: 'team', label: 'Team Report' },
  { value: 'department', label: 'Department Report' },
  { value: 'executive', label: 'Executive Summary' },
];

const FORMAT_OPTIONS: { value: ProductivityReportFormat; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel (XLSX)' },
];

const REPORT_SECTIONS = [
  { id: 'summary', label: 'Executive Summary' },
  { id: 'metrics', label: 'Key Metrics' },
  { id: 'trends', label: 'Trend Charts' },
  { id: 'leaderboard', label: 'User Leaderboard' },
  { id: 'cycle_time', label: 'Cycle Time Analysis' },
  { id: 'revisions', label: 'Revision Analysis' },
  { id: 'ai_usage', label: 'AI Usage Stats' },
  { id: 'recommendations', label: 'AI Recommendations' },
];

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function ReportConfigManager() {
  const [configs, setConfigs] = useState<ProductivityReportConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [reportType, setReportType] = useState<ProductivityReportType>('individual');
  const [schedule, setSchedule] = useState('');
  const [recipients, setRecipients] = useState('');
  const [format, setFormat] = useState<ProductivityReportFormat>('pdf');
  const [includeSections, setIncludeSections] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/productivity/report-configs');
      const json = await res.json();
      if (json.data) setConfigs(json.data);
    } catch {
      showToast('error', 'Failed to load report configs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const resetForm = () => {
    setName('');
    setReportType('individual');
    setSchedule('');
    setRecipients('');
    setFormat('pdf');
    setIncludeSections([]);
    setEditId(null);
    setShowForm(false);
  };

  const toggleSection = (sectionId: string) => {
    setIncludeSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((s) => s !== sectionId)
        : [...prev, sectionId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const recipientsList = recipients
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);

      if (editId) {
        const res = await fetch(`/api/productivity/report-configs/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            schedule: schedule || undefined,
            recipients: recipientsList,
            format,
            include_sections: includeSections,
          }),
        });
        if (!res.ok) throw new Error('Failed to update config');
        showToast('success', 'Report config updated.');
      } else {
        const res = await fetch('/api/productivity/report-configs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            reportType,
            schedule: schedule || undefined,
            recipients: recipientsList,
            format,
            includeSections,
          }),
        });
        if (!res.ok) throw new Error('Failed to create config');
        showToast('success', 'Report config created.');
      }
      resetForm();
      await fetchConfigs();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (config: ProductivityReportConfig) => {
    setEditId(config.id);
    setName(config.name);
    setReportType(config.report_type);
    setSchedule(config.schedule || '');
    setRecipients(config.recipients.join(', '));
    setFormat(config.format);
    setIncludeSections(config.include_sections);
    setShowForm(true);
  };

  const handleToggleActive = async (config: ProductivityReportConfig) => {
    try {
      await fetch(`/api/productivity/report-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !config.is_active }),
      });
      await fetchConfigs();
    } catch {
      showToast('error', 'Failed to toggle config.');
    }
  };

  const handleDelete = async (configId: string) => {
    try {
      await fetch(`/api/productivity/report-configs/${configId}`, { method: 'DELETE' });
      setConfigs((prev) => prev.filter((c) => c.id !== configId));
      showToast('success', 'Config deleted.');
    } catch {
      showToast('error', 'Failed to delete config.');
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
          Loading report configs...
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
          <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">Report Configurations</h3>
          <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5">
            Configure automated productivity reports with scheduling and delivery
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Config
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border-2 border-electric/20 dark:border-electric/30 bg-white dark:bg-dark-surface p-6 shadow-sm">
          <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-4">
            {editId ? 'Edit Config' : 'Create Report Config'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Input
              label="Config Name"
              placeholder="e.g., Weekly Team Report"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div>
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Report Type</label>
              <div className="relative">
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as ProductivityReportType)}
                  className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
                >
                  {REPORT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30 dark:text-slate-600">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Input
              label="Schedule (cron)"
              placeholder="e.g., 0 9 * * 1 (every Monday 9am)"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            />
            <div>
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Format</label>
              <div className="relative">
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ProductivityReportFormat)}
                  className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
                >
                  {FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30 dark:text-slate-600">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div className="mb-4">
            <Input
              label="Recipients (comma-separated emails)"
              placeholder="e.g., alice@example.com, bob@example.com"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
          </div>

          {/* Sections checkboxes */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-2 font-body">Include Sections</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {REPORT_SECTIONS.map((section) => (
                <label key={section.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeSections.includes(section.id)}
                    onChange={() => toggleSection(section.id)}
                    className="w-4 h-4 rounded border-navy/20 dark:border-slate-600 text-electric focus:ring-electric/30"
                  />
                  <span className="text-xs text-navy/70 dark:text-slate-300 font-body">{section.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={resetForm}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={!name.trim()}
              onClick={handleSave}
            >
              {editId ? 'Update Config' : 'Create Config'}
            </Button>
          </div>
        </div>
      )}

      {/* Configs List */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        {configs.length === 0 ? (
          <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
            No report configurations yet. Create one to set up automated reports.
          </div>
        ) : (
          <div className="divide-y divide-cream-dark dark:divide-slate-700">
            {configs.map((config) => (
              <div key={config.id} className="flex items-center gap-4 px-6 py-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                <button
                  onClick={() => handleToggleActive(config)}
                  className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                    config.is_active ? 'bg-electric' : 'bg-navy/20 dark:bg-slate-700'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    config.is_active ? 'left-5' : 'left-0.5'
                  }`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">{config.name}</p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-electric/10 text-electric border border-electric/20">
                      {config.report_type}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-navy/10 dark:bg-slate-800 text-navy/60 dark:text-slate-400">
                      {config.format.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
                    {config.schedule ? `Schedule: ${config.schedule}` : 'Manual'} |
                    Recipients: {config.recipients.length} |
                    Sections: {config.include_sections.length}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(config)}>Edit</Button>
                  <button
                    onClick={() => handleDelete(config.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
