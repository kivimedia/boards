'use client';

import { useState, useCallback } from 'react';
import { TRIGGER_OPTIONS, ACTION_OPTIONS } from '@/lib/automation-rules-builder';
import type { AutomationTriggerType, AutomationActionType } from '@/lib/types';

interface RuleBuilderProps {
  boardId: string;
  onRuleCreated?: () => void;
  onCancel?: () => void;
  initialValues?: {
    name?: string;
    description?: string;
    trigger_type?: AutomationTriggerType;
    trigger_config?: Record<string, unknown>;
    action_type?: AutomationActionType;
    action_config?: Record<string, unknown>;
  };
  ruleId?: string;
}

export default function RuleBuilder({
  boardId,
  onRuleCreated,
  onCancel,
  initialValues,
  ruleId,
}: RuleBuilderProps) {
  const [name, setName] = useState(initialValues?.name || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [triggerType, setTriggerType] = useState<string>(initialValues?.trigger_type || '');
  const [triggerConfig, setTriggerConfig] = useState<Record<string, string>>(
    (initialValues?.trigger_config as Record<string, string>) || {}
  );
  const [actionType, setActionType] = useState<string>(initialValues?.action_type || '');
  const [actionConfig, setActionConfig] = useState<Record<string, string>>(
    (initialValues?.action_config as Record<string, string>) || {}
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTrigger = TRIGGER_OPTIONS.find((t) => t.value === triggerType);
  const selectedAction = ACTION_OPTIONS.find((a) => a.value === actionType);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Rule name is required'); return; }
    if (!triggerType) { setError('Select a trigger'); return; }
    if (!actionType) { setError('Select an action'); return; }

    setLoading(true);
    setError(null);

    const url = ruleId
      ? `/api/boards/${boardId}/automations/${ruleId}`
      : `/api/boards/${boardId}/automations`;
    const method = ruleId ? 'PATCH' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          action_type: actionType,
          action_config: actionConfig,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save rule');
      }

      onRuleCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule');
    } finally {
      setLoading(false);
    }
  }, [name, description, triggerType, triggerConfig, actionType, actionConfig, boardId, ruleId, onRuleCreated]);

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
          {ruleId ? 'Edit Automation Rule' : 'Create Automation Rule'}
        </h3>
        <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
          When [trigger] happens, then [action] runs
        </p>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-5">
        {/* Name & Description */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Rule Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Move to Done when checklist completed"
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this rule does"
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
            />
          </div>
        </div>

        {/* Trigger */}
        <div className="rounded-xl border border-cream-dark dark:border-slate-700 p-4 bg-cream/20 dark:bg-navy/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold font-heading">
              W
            </span>
            <span className="text-xs font-semibold text-navy dark:text-slate-100 font-heading uppercase tracking-wider">When (Trigger)</span>
          </div>
          <select
            value={triggerType}
            onChange={(e) => {
              setTriggerType(e.target.value);
              setTriggerConfig({});
            }}
            className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
          >
            <option value="">Select a trigger...</option>
            {TRIGGER_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          {/* Trigger config fields */}
          {selectedTrigger && selectedTrigger.config.length > 0 && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectedTrigger.config.map((field) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-navy/50 dark:text-slate-400 font-body mb-1">
                    {field.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={triggerConfig[field] || ''}
                    onChange={(e) => setTriggerConfig({ ...triggerConfig, [field]: e.target.value })}
                    placeholder={field}
                    className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action */}
        <div className="rounded-xl border border-cream-dark dark:border-slate-700 p-4 bg-cream/20 dark:bg-navy/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-lg bg-electric/10 text-electric flex items-center justify-center text-xs font-bold font-heading">
              T
            </span>
            <span className="text-xs font-semibold text-navy dark:text-slate-100 font-heading uppercase tracking-wider">Then (Action)</span>
          </div>
          <select
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value);
              setActionConfig({});
            }}
            className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
          >
            <option value="">Select an action...</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>

          {/* Action config fields */}
          {selectedAction && selectedAction.config.length > 0 && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {selectedAction.config.map((field) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-navy/50 dark:text-slate-400 font-body mb-1">
                    {field.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={actionConfig[field] || ''}
                    onChange={(e) => setActionConfig({ ...actionConfig, [field]: e.target.value })}
                    placeholder={field}
                    className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && <p className="text-xs text-red-600 font-body">{error}</p>}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className={`
              px-5 py-2.5 rounded-xl text-sm font-semibold font-body bg-electric text-white
              hover:bg-electric/90 transition-all duration-200
              ${loading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {loading ? 'Saving...' : ruleId ? 'Update Rule' : 'Create Rule'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold font-body border border-cream-dark dark:border-slate-700 text-navy dark:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 transition-all duration-200"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
