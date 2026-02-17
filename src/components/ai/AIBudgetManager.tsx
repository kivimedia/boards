'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AIBudgetConfig, AIBudgetScope } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface Toast {
  type: 'success' | 'error';
  message: string;
}

interface BudgetWithSpend extends AIBudgetConfig {
  spent_usd?: number;
}

const SCOPE_LABELS: Record<AIBudgetScope, string> = {
  global: 'Global',
  provider: 'Provider',
  activity: 'Activity',
  user: 'User',
  board: 'Board',
  client: 'Client',
};

const SCOPE_DESCRIPTIONS: Record<AIBudgetScope, string> = {
  global: 'Applies to all AI usage across the workspace',
  provider: 'Limits spending for a specific AI provider',
  activity: 'Limits spending for a specific AI activity',
  user: 'Limits spending for a specific user',
  board: 'Limits spending within a specific board',
  client: 'Limits spending for a specific client',
};

function getProgressColor(pct: number, alertThreshold: number): string {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= alertThreshold) return 'bg-orange-500';
  if (pct >= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

function getStatusLabel(pct: number, alertThreshold: number): { text: string; color: string } {
  if (pct >= 100) return { text: 'Over budget', color: 'text-red-600 bg-red-50 border-red-200' };
  if (pct >= alertThreshold) return { text: 'Alert', color: 'text-orange-600 bg-orange-50 border-orange-200' };
  if (pct >= 50) return { text: 'Moderate', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' };
  return { text: 'Healthy', color: 'text-green-700 bg-green-50 border-green-200' };
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export default function AIBudgetManager() {
  const [budgets, setBudgets] = useState<BudgetWithSpend[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Add budget state
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [addScope, setAddScope] = useState<AIBudgetScope>('global');
  const [addScopeId, setAddScopeId] = useState('');
  const [addMonthlyCap, setAddMonthlyCap] = useState('100');
  const [addAlertThreshold, setAddAlertThreshold] = useState('80');
  const [saving, setSaving] = useState(false);

  // Edit budget state
  const [editBudget, setEditBudget] = useState<BudgetWithSpend | null>(null);
  const [editMonthlyCap, setEditMonthlyCap] = useState('');
  const [editAlertThreshold, setEditAlertThreshold] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchBudgets = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/budgets');
      const json = await res.json();
      if (json.data) {
        setBudgets(json.data);
      }
    } catch {
      showToast('error', 'Failed to load budget rules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const handleAddBudget = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        scope: addScope,
        monthly_cap_usd: parseFloat(addMonthlyCap),
        alert_threshold_pct: parseInt(addAlertThreshold, 10),
      };
      if (addScope !== 'global' && addScopeId.trim()) {
        body.scope_id = addScopeId.trim();
      }

      const res = await fetch('/api/ai/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create budget rule');
      }
      showToast('success', 'Budget rule created successfully.');
      setShowAddBudget(false);
      setAddScope('global');
      setAddScopeId('');
      setAddMonthlyCap('100');
      setAddAlertThreshold('80');
      await fetchBudgets();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create budget rule.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (budget: BudgetWithSpend) => {
    setEditBudget(budget);
    setEditMonthlyCap(String(budget.monthly_cap_usd));
    setEditAlertThreshold(String(budget.alert_threshold_pct));
  };

  const handleEditBudget = async () => {
    if (!editBudget) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/ai/budgets/${editBudget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthly_cap_usd: parseFloat(editMonthlyCap),
          alert_threshold_pct: parseInt(editAlertThreshold, 10),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update budget');
      }
      showToast('success', 'Budget rule updated.');
      setEditBudget(null);
      await fetchBudgets();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update budget.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/ai/budgets/${deleteId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete budget');
      }
      setBudgets((prev) => prev.filter((b) => b.id !== deleteId));
      showToast('success', 'Budget rule deleted.');
      setDeleteId(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete budget.');
    } finally {
      setDeleting(false);
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
          Loading budget rules...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
            animate-in fade-in slide-in-from-top-2 duration-200
            ${toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
            }
          `}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">Budget Rules</h3>
          <p className="text-navy/50 dark:text-slate-400 font-body text-sm mt-0.5">
            Set spending limits to prevent runaway AI costs.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowAddBudget(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Rule
        </Button>
      </div>

      {/* Budget Rules List */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        {budgets.length === 0 ? (
          <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
            No budget rules configured. Add a rule to set spending limits for AI features.
          </div>
        ) : (
          <div className="divide-y divide-cream-dark dark:divide-slate-700">
            {budgets.map((budget) => {
              const spent = budget.spent_usd || 0;
              const cap = budget.monthly_cap_usd;
              const pct = cap > 0 ? Math.min(Math.round((spent / cap) * 100), 100) : 0;
              const rawPct = cap > 0 ? (spent / cap) * 100 : 0;
              const status = getStatusLabel(rawPct, budget.alert_threshold_pct);
              const barColor = getProgressColor(rawPct, budget.alert_threshold_pct);

              return (
                <div key={budget.id} className="px-6 py-5 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-electric/10 text-electric border border-electric/20">
                          {SCOPE_LABELS[budget.scope]}
                        </span>
                        {budget.scope_id && (
                          <span className="text-navy/50 dark:text-slate-400 font-body text-xs font-mono truncate">
                            {budget.scope_id}
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${status.color}`}>
                          {status.text}
                        </span>
                      </div>
                      <p className="text-navy/50 dark:text-slate-400 font-body text-xs">
                        {SCOPE_DESCRIPTIONS[budget.scope]}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(budget)}>
                        Edit
                      </Button>
                      <button
                        onClick={() => setDeleteId(budget.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Delete rule"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-2">
                    <div className="w-full bg-cream-dark dark:bg-slate-700 rounded-full h-3">
                      <div
                        className={`${barColor} rounded-full h-3 transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs font-body">
                    <span className="text-navy/60 dark:text-slate-400">
                      {formatCost(spent)} of {formatCost(cap)}
                    </span>
                    <span className="text-navy/40 dark:text-slate-500">
                      {rawPct.toFixed(1)}% used | Alert at {budget.alert_threshold_pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Budget Modal */}
      <Modal
        isOpen={showAddBudget}
        onClose={() => {
          setShowAddBudget(false);
          setAddScope('global');
          setAddScopeId('');
          setAddMonthlyCap('100');
          setAddAlertThreshold('80');
        }}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-4">
            Add Budget Rule
          </h3>
          <p className="text-navy/50 dark:text-slate-400 font-body text-sm mb-6">
            Create a monthly spending limit. When the threshold is reached, an alert will be triggered. Exceeding the cap will block further AI calls in that scope.
          </p>

          {/* Scope */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
              Scope
            </label>
            <div className="relative">
              <select
                value={addScope}
                onChange={(e) => {
                  setAddScope(e.target.value as AIBudgetScope);
                  if (e.target.value === 'global') setAddScopeId('');
                }}
                className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              >
                {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            <p className="text-navy/40 dark:text-slate-500 font-body text-xs mt-1">
              {SCOPE_DESCRIPTIONS[addScope]}
            </p>
          </div>

          {/* Scope ID (conditional) */}
          {addScope !== 'global' && (
            <div className="mb-4">
              <Input
                label={`${SCOPE_LABELS[addScope]} ID`}
                placeholder={
                  addScope === 'provider' ? 'e.g., anthropic' :
                  addScope === 'activity' ? 'e.g., chatbot_global' :
                  `Enter ${SCOPE_LABELS[addScope].toLowerCase()} ID...`
                }
                value={addScopeId}
                onChange={(e) => setAddScopeId(e.target.value)}
              />
            </div>
          )}

          {/* Monthly Cap */}
          <div className="mb-4">
            <Input
              label="Monthly Cap (USD)"
              type="number"
              min="1"
              step="1"
              value={addMonthlyCap}
              onChange={(e) => setAddMonthlyCap(e.target.value)}
            />
          </div>

          {/* Alert Threshold */}
          <div className="mb-6">
            <Input
              label="Alert Threshold (%)"
              type="number"
              min="1"
              max="100"
              step="1"
              value={addAlertThreshold}
              onChange={(e) => setAddAlertThreshold(e.target.value)}
            />
            <p className="text-navy/40 dark:text-slate-500 font-body text-xs mt-1">
              An alert will trigger when spending reaches this percentage of the cap.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setShowAddBudget(false);
                setAddScope('global');
                setAddScopeId('');
                setAddMonthlyCap('100');
                setAddAlertThreshold('80');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={!addMonthlyCap || parseFloat(addMonthlyCap) <= 0}
              onClick={handleAddBudget}
            >
              Create Rule
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Budget Modal */}
      <Modal
        isOpen={!!editBudget}
        onClose={() => setEditBudget(null)}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-1">
            Edit Budget Rule
          </h3>
          {editBudget && (
            <p className="text-navy/50 dark:text-slate-400 font-body text-sm mb-6">
              {SCOPE_LABELS[editBudget.scope]}{editBudget.scope_id ? ` (${editBudget.scope_id})` : ''}
            </p>
          )}

          <div className="mb-4">
            <Input
              label="Monthly Cap (USD)"
              type="number"
              min="1"
              step="1"
              value={editMonthlyCap}
              onChange={(e) => setEditMonthlyCap(e.target.value)}
            />
          </div>

          <div className="mb-6">
            <Input
              label="Alert Threshold (%)"
              type="number"
              min="1"
              max="100"
              step="1"
              value={editAlertThreshold}
              onChange={(e) => setEditAlertThreshold(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setEditBudget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={editSaving}
              disabled={!editMonthlyCap || parseFloat(editMonthlyCap) <= 0}
              onClick={handleEditBudget}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        size="sm"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-2">
            Delete Budget Rule
          </h3>
          <p className="text-navy/60 dark:text-slate-400 font-body text-sm mb-6">
            Are you sure you want to delete this budget rule? Without a budget rule in place, there will be no spending limit for this scope.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={deleting}
              onClick={handleDelete}
            >
              Delete Rule
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
