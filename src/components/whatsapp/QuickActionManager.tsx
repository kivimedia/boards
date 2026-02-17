'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WhatsAppQuickAction, QuickActionType } from '@/lib/types';

const ACTION_TYPE_LABELS: Record<QuickActionType, string> = {
  mark_done: 'Mark Done',
  approve: 'Approve',
  reject: 'Reject',
  assign: 'Assign',
  comment: 'Comment',
  snooze: 'Snooze',
};

const ACTION_TYPE_COLORS: Record<QuickActionType, string> = {
  mark_done: 'bg-green-100 text-green-700',
  approve: 'bg-blue-100 text-blue-700',
  reject: 'bg-red-100 text-red-700',
  assign: 'bg-purple-100 text-purple-700',
  comment: 'bg-amber-100 text-amber-700',
  snooze: 'bg-gray-100 text-gray-700',
};

export default function QuickActionManager() {
  const [actions, setActions] = useState<WhatsAppQuickAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newActionType, setNewActionType] = useState<QuickActionType>('mark_done');
  const [newDescription, setNewDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/quick-actions');
      const json = await res.json();
      if (json.data) setActions(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const handleCreate = async () => {
    if (!newKeyword.trim()) return;

    setError(null);

    try {
      const res = await fetch('/api/whatsapp/quick-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: newKeyword.trim(),
          action_type: newActionType,
          description: newDescription.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (json.error) {
        setError(json.error);
        return;
      }

      if (json.data) {
        setActions((prev) => [...prev, json.data]);
        setNewKeyword('');
        setNewDescription('');
        setShowForm(false);
      }
    } catch {
      setError('Failed to create quick action');
    }
  };

  const handleDelete = async (actionId: string) => {
    try {
      await fetch(`/api/whatsapp/quick-actions/${actionId}`, { method: 'DELETE' });
      setActions((prev) => prev.filter((a) => a.id !== actionId));
    } catch {
      setError('Failed to delete quick action');
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-32 rounded-xl bg-cream-dark/40 dark:bg-slate-800/40" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Quick Actions</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors"
        >
          {showForm ? 'Cancel' : 'Add Action'}
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200">
          <p className="text-xs text-red-600 font-body">{error}</p>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mb-4 p-4 rounded-lg bg-cream/50 dark:bg-navy/30 border border-cream-dark/30 dark:border-slate-700/30 space-y-3">
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Keyword</label>
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="e.g., done, approve, reject"
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Action Type</label>
            <select
              value={newActionType}
              onChange={(e) => setNewActionType(e.target.value as QuickActionType)}
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
            >
              {Object.entries(ACTION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="What this action does..."
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={!newKeyword.trim()}
            className="w-full px-4 py-2 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Quick Action
          </button>
        </div>
      )}

      {/* Actions list */}
      {actions.length === 0 ? (
        <p className="text-xs text-navy/50 dark:text-slate-400 font-body text-center py-4">
          No quick actions configured yet.
        </p>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <div
              key={action.id}
              className="flex items-center justify-between p-3 rounded-lg bg-cream/30 dark:bg-navy/30 border border-cream-dark/20 dark:border-slate-700/20"
            >
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 rounded-md text-xs font-mono font-bold bg-navy/10 dark:bg-slate-700 text-navy dark:text-slate-100">
                  {action.keyword}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium font-body ${
                    ACTION_TYPE_COLORS[action.action_type as QuickActionType] || 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {ACTION_TYPE_LABELS[action.action_type as QuickActionType] || action.action_type}
                </span>
                {action.description && (
                  <span className="text-xs text-navy/50 dark:text-slate-400 font-body">{action.description}</span>
                )}
              </div>
              <button
                onClick={() => handleDelete(action.id)}
                className="px-2 py-1 rounded-lg text-xs font-medium font-body bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 transition-colors"
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
