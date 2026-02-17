'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AutomationRule } from '@/lib/types';

interface RuleListProps {
  boardId: string;
  onEdit?: (rule: AutomationRule) => void;
  refreshKey?: number;
}

export default function RuleList({ boardId, onEdit, refreshKey }: RuleListProps) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/automations`);
      if (!res.ok) throw new Error('Failed to load rules');
      const json = await res.json();
      setRules(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules, refreshKey]);

  const handleToggle = useCallback(async (rule: AutomationRule) => {
    try {
      const res = await fetch(`/api/boards/${boardId}/automations/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !rule.is_active }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      setRules((prev) =>
        prev.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r)
      );
    } catch {
      setError('Failed to toggle rule');
      setTimeout(() => setError(null), 3000);
    }
  }, [boardId]);

  const handleDelete = useCallback(async (ruleId: string) => {
    try {
      const res = await fetch(`/api/boards/${boardId}/automations/${ruleId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      setError('Failed to delete rule');
      setTimeout(() => setError(null), 3000);
    }
  }, [boardId]);

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;

    setRules((prev) => {
      const updated = [...prev];
      const [dragged] = updated.splice(dragIdx, 1);
      updated.splice(idx, 0, dragged);
      return updated;
    });
    setDragIdx(idx);
  }, [dragIdx]);

  const handleDragEnd = useCallback(async () => {
    setDragIdx(null);
    // Save new order
    const ruleIds = rules.map((r) => r.id);
    try {
      await fetch(`/api/boards/${boardId}/automations/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_ids: ruleIds }),
      });
    } catch {
      setError('Failed to save order');
      setTimeout(() => setError(null), 3000);
    }
  }, [rules, boardId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm p-6">
        <div className="flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Automation Rules</h3>
          <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">{rules.length} rule{rules.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-600 font-body">{error}</p>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No automation rules yet</p>
          <p className="text-xs text-navy/30 dark:text-slate-600 font-body mt-1">Create a rule to get started</p>
        </div>
      ) : (
        <div className="divide-y divide-cream-dark dark:divide-slate-700">
          {rules.map((rule, idx) => (
            <div
              key={rule.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`
                flex items-center gap-3 px-5 py-3.5 transition-colors
                ${dragIdx === idx ? 'bg-electric/5' : 'hover:bg-cream/30 dark:hover:bg-slate-800/30'}
                cursor-grab active:cursor-grabbing
              `}
            >
              {/* Drag handle */}
              <div className="text-navy/20 dark:text-slate-600 shrink-0">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="9" cy="6" r="1.5" />
                  <circle cx="15" cy="6" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="18" r="1.5" />
                  <circle cx="15" cy="18" r="1.5" />
                </svg>
              </div>

              {/* Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={rule.is_active}
                onClick={() => handleToggle(rule)}
                className={`
                  relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0
                  ${rule.is_active ? 'bg-green-500' : 'bg-navy/20 dark:bg-slate-700'}
                `}
              >
                <span
                  className={`
                    absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
                    ${rule.is_active ? 'translate-x-4' : 'translate-x-0'}
                  `}
                />
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium font-body truncate ${rule.is_active ? 'text-navy dark:text-slate-100' : 'text-navy/40 dark:text-slate-500'}`}>
                  {rule.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                    {rule.trigger_type.replace(/_/g, ' ')}
                  </span>
                  <svg className="w-3 h-3 text-navy/20 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-electric/10 text-electric">
                    {rule.action_type.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {onEdit && (
                  <button
                    onClick={() => onEdit(rule)}
                    className="p-1.5 rounded-lg text-navy/30 dark:text-slate-600 hover:text-electric hover:bg-electric/5 transition-all"
                    title="Edit rule"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="p-1.5 rounded-lg text-navy/30 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  title="Delete rule"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
