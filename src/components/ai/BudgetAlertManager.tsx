'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import type { AIBudgetAlert, BudgetAlertScope } from '@/lib/types';

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const SCOPE_OPTIONS: { value: BudgetAlertScope; label: string }[] = [
  { value: 'global', label: 'Global' },
  { value: 'user', label: 'User' },
  { value: 'board', label: 'Board' },
  { value: 'activity', label: 'Activity' },
];

const SCOPE_LABELS: Record<string, string> = {
  global: 'Global',
  user: 'User',
  board: 'Board',
  activity: 'Activity',
};

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export default function BudgetAlertManager() {
  const [alerts, setAlerts] = useState<AIBudgetAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [checking, setChecking] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formScope, setFormScope] = useState<BudgetAlertScope>('global');
  const [formScopeId, setFormScopeId] = useState('');
  const [formThreshold, setFormThreshold] = useState(80);
  const [formMonthlyCap, setFormMonthlyCap] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/budget-alerts');
      const json = await res.json();
      if (res.ok && json.data) {
        setAlerts(json.data);
      } else {
        setError(json.error || 'Failed to load budget alerts.');
      }
    } catch {
      setError('Network error loading budget alerts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleCreate = async () => {
    const cap = parseFloat(formMonthlyCap);
    if (!cap || cap <= 0) {
      showToast('error', 'Monthly cap must be a positive number.');
      return;
    }

    if (formScope !== 'global' && !formScopeId.trim()) {
      showToast('error', 'Scope ID is required for non-global scopes.');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/ai/budget-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: formScope,
          scopeId: formScope === 'global' ? undefined : formScopeId.trim(),
          thresholdPercent: formThreshold,
          monthlyCap: cap,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Create failed');
      }

      showToast('success', 'Budget alert created.');
      setShowForm(false);
      setFormMonthlyCap('');
      setFormScopeId('');
      fetchAlerts();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (alertId: string) => {
    if (!confirm('Delete this budget alert?')) return;

    try {
      const res = await fetch(`/api/ai/budget-alerts/${alertId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Delete failed');

      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      showToast('success', 'Alert deleted.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const handleUpdateThreshold = async (alertId: string, newThreshold: number) => {
    try {
      const res = await fetch(`/api/ai/budget-alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold_percent: newThreshold }),
      });

      if (!res.ok) throw new Error('Update failed');

      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, threshold_percent: newThreshold } : a))
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const handleUpdateCap = async (alertId: string, newCap: number) => {
    try {
      const res = await fetch(`/api/ai/budget-alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly_cap: newCap }),
      });

      if (!res.ok) throw new Error('Update failed');

      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, monthly_cap: newCap } : a))
      );
      showToast('success', 'Cap updated.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const handleCheckAlerts = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/ai/budget-alerts/check', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.data) {
        const count = json.data.triggeredCount;
        showToast('success', count > 0 ? `${count} alert(s) triggered.` : 'No alerts triggered.');
        fetchAlerts();
      } else {
        throw new Error(json.error || 'Check failed');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Check failed.');
    } finally {
      setChecking(false);
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
          Loading alerts...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-red-800 font-body text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
            ${toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
            }
          `}
        >
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">Budget Alerts</h3>
          <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
            Set spending thresholds and caps per scope.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleCheckAlerts} loading={checking}>
            Check Now
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add Alert'}
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-cream/50 dark:bg-navy/30 rounded-2xl border border-cream-dark dark:border-slate-700 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Scope</label>
              <select
                value={formScope}
                onChange={(e) => setFormScope(e.target.value as BudgetAlertScope)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              >
                {SCOPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            {formScope !== 'global' && (
              <div>
                <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Scope ID</label>
                <input
                  type="text"
                  value={formScopeId}
                  onChange={(e) => setFormScopeId(e.target.value)}
                  placeholder="User ID, Board ID, or Activity name"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">
                Alert Threshold: {formThreshold}%
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={formThreshold}
                onChange={(e) => setFormThreshold(parseInt(e.target.value))}
                className="w-full accent-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Monthly Cap (USD)</label>
              <input
                type="number"
                step="0.01"
                value={formMonthlyCap}
                onChange={(e) => setFormMonthlyCap(e.target.value)}
                placeholder="e.g. 100.00"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleCreate} loading={saving}>
              Create Alert
            </Button>
          </div>
        </div>
      )}

      {/* Alerts List */}
      {alerts.length === 0 ? (
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 px-6 py-8 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
          No budget alerts configured yet.
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const spendPercent = alert.monthly_cap > 0
              ? Math.min(100, (alert.current_spend / alert.monthly_cap) * 100)
              : 0;
            const isOverThreshold = spendPercent >= alert.threshold_percent;

            return (
              <div
                key={alert.id}
                className={`
                  bg-white dark:bg-dark-surface rounded-2xl border-2 p-4 transition-colors
                  ${isOverThreshold ? 'border-red-200' : 'border-cream-dark dark:border-slate-700'}
                `}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-heading font-semibold text-navy dark:text-slate-100">
                        {SCOPE_LABELS[alert.scope] || alert.scope}
                      </span>
                      {alert.scope_id && (
                        <span className="text-xs bg-cream px-1.5 py-0.5 rounded font-body text-navy/50">
                          {alert.scope_id}
                        </span>
                      )}
                      {alert.alert_sent && (
                        <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded font-body">
                          Alerted
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
                      Threshold: {alert.threshold_percent}% | Cap: {formatCost(alert.monthly_cap)} | Spend: {formatCost(alert.current_spend)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(alert.id)}
                    className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                  >
                    Delete
                  </button>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-cream-dark dark:bg-slate-700 rounded-full h-2.5 mb-2">
                  <div
                    className={`
                      h-2.5 rounded-full transition-all duration-300
                      ${spendPercent >= 100 ? 'bg-red-500' : spendPercent >= alert.threshold_percent ? 'bg-amber-500' : 'bg-electric'}
                    `}
                    style={{ width: `${Math.min(100, spendPercent)}%` }}
                  />
                </div>

                <div className="flex items-center gap-4">
                  {/* Threshold slider */}
                  <div className="flex-1">
                    <label className="text-xs text-navy/40 dark:text-slate-500 font-body">Threshold: {alert.threshold_percent}%</label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={alert.threshold_percent}
                      onChange={(e) => handleUpdateThreshold(alert.id, parseInt(e.target.value))}
                      className="w-full accent-electric"
                    />
                  </div>
                  {/* Cap input */}
                  <div className="w-28">
                    <label className="text-xs text-navy/40 dark:text-slate-500 font-body">Cap (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={alert.monthly_cap}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (val > 0) handleUpdateCap(alert.id, val);
                      }}
                      className="w-full px-2 py-1 rounded-lg bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-xs text-navy dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-electric/30 font-body"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
