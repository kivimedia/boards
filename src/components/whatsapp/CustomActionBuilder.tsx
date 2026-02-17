'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WhatsAppCustomAction } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const ACTION_TYPES = [
  { value: 'mark_done', label: 'Mark Done' },
  { value: 'approve', label: 'Approve' },
  { value: 'reject', label: 'Reject' },
  { value: 'assign', label: 'Assign' },
  { value: 'comment', label: 'Comment' },
  { value: 'snooze', label: 'Snooze' },
  { value: 'custom', label: 'Custom' },
];

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function CustomActionBuilder() {
  const [actions, setActions] = useState<WhatsAppCustomAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [label, setLabel] = useState('');
  const [actionType, setActionType] = useState('mark_done');
  const [actionConfig, setActionConfig] = useState('{}');
  const [responseTemplate, setResponseTemplate] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/custom-actions');
      const json = await res.json();
      if (json.data) setActions(json.data);
    } catch {
      showToast('error', 'Failed to load custom actions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const resetForm = () => {
    setKeyword('');
    setLabel('');
    setActionType('mark_done');
    setActionConfig('{}');
    setResponseTemplate('');
    setEditId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!keyword.trim() || !label.trim()) return;
    setSaving(true);

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(actionConfig);
    } catch {
      showToast('error', 'Invalid JSON in action config');
      setSaving(false);
      return;
    }

    try {
      if (editId) {
        const res = await fetch(`/api/whatsapp/custom-actions/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: keyword.trim(),
            label: label.trim(),
            action_type: actionType,
            action_config: parsedConfig,
            response_template: responseTemplate || undefined,
          }),
        });
        if (!res.ok) throw new Error('Failed to update action');
        showToast('success', 'Action updated.');
      } else {
        const res = await fetch('/api/whatsapp/custom-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: keyword.trim(),
            label: label.trim(),
            action_type: actionType,
            action_config: parsedConfig,
            response_template: responseTemplate || undefined,
          }),
        });
        if (!res.ok) throw new Error('Failed to create action');
        showToast('success', 'Action created.');
      }
      resetForm();
      await fetchActions();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (action: WhatsAppCustomAction) => {
    try {
      await fetch(`/api/whatsapp/custom-actions/${action.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !action.is_active }),
      });
      await fetchActions();
    } catch {
      showToast('error', 'Failed to toggle action.');
    }
  };

  const handleEdit = (action: WhatsAppCustomAction) => {
    setEditId(action.id);
    setKeyword(action.keyword);
    setLabel(action.label);
    setActionType(action.action_type);
    setActionConfig(JSON.stringify(action.action_config, null, 2));
    setResponseTemplate(action.response_template || '');
    setShowForm(true);
  };

  const handleDelete = async (actionId: string) => {
    try {
      await fetch(`/api/whatsapp/custom-actions/${actionId}`, { method: 'DELETE' });
      setActions((prev) => prev.filter((a) => a.id !== actionId));
      showToast('success', 'Action deleted.');
    } catch {
      showToast('error', 'Failed to delete action.');
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
          Loading custom actions...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm ${
            toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">Custom WhatsApp Actions</h3>
          <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5">
            Define keyword-triggered actions for WhatsApp commands
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Action
        </Button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="rounded-2xl border-2 border-electric/20 dark:border-electric/30 bg-white dark:bg-dark-surface p-6 shadow-sm">
          <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-4">
            {editId ? 'Edit Action' : 'Create New Action'}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Input
              label="Keyword"
              placeholder="e.g., done, approve"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Input
              label="Label"
              placeholder="e.g., Mark as Done"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Action Type</label>
            <div className="relative">
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              >
                {ACTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30 dark:text-slate-600">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Action Config (JSON)</label>
            <textarea
              value={actionConfig}
              onChange={(e) => setActionConfig(e.target.value)}
              rows={4}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Response Template</label>
            <textarea
              value={responseTemplate}
              onChange={(e) => setResponseTemplate(e.target.value)}
              rows={3}
              placeholder="e.g., Card {{card_title}} has been marked as done."
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
            />
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={resetForm}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={!keyword.trim() || !label.trim()}
              onClick={handleSave}
            >
              {editId ? 'Update Action' : 'Create Action'}
            </Button>
          </div>
        </div>
      )}

      {/* Actions List */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        {actions.length === 0 ? (
          <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
            No custom actions configured. Create one to get started.
          </div>
        ) : (
          <div className="divide-y divide-cream-dark dark:divide-slate-700">
            {actions.map((action) => (
              <div key={action.id} className="flex items-center gap-4 px-6 py-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                <button
                  onClick={() => handleToggleActive(action)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    action.is_active ? 'bg-electric' : 'bg-navy/20 dark:bg-slate-700'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    action.is_active ? 'left-5' : 'left-0.5'
                  }`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-navy/10 dark:bg-slate-700 text-navy dark:text-slate-100">
                      /{action.keyword}
                    </span>
                    <span className="text-sm font-medium text-navy dark:text-slate-100 font-body">{action.label}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-electric/10 text-electric border border-electric/20">
                      {action.action_type}
                    </span>
                  </div>
                  {action.response_template && (
                    <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5 truncate">{action.response_template}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(action)}>Edit</Button>
                  <button
                    onClick={() => handleDelete(action.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Delete action"
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
