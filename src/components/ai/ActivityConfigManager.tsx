'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import type { AIActivityConfig } from '@/lib/types';

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const ACTIVITY_OPTIONS = [
  'chatbot_ticket',
  'chatbot_board',
  'chatbot_global',
  'email_draft',
  'brief_assist',
  'image_prompt_enhance',
  'proposal_generation',
  'lead_triage',
  'follow_up_draft',
  'friendor_email',
];

const ACTIVITY_LABELS: Record<string, string> = {
  chatbot_ticket: 'Chatbot (Ticket)',
  chatbot_board: 'Chatbot (Board)',
  chatbot_global: 'Chatbot (Global)',
  email_draft: 'Email Draft',
  brief_assist: 'Brief Assist',
  image_prompt_enhance: 'Image Prompt Enhance',
  proposal_generation: 'Proposal Generation',
  lead_triage: 'Lead Triage',
  follow_up_draft: 'Follow-Up Draft',
  friendor_email: 'Friendor Email',
};

export default function ActivityConfigManager() {
  const [configs, setConfigs] = useState<AIActivityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formActivity, setFormActivity] = useState(ACTIVITY_OPTIONS[0]);
  const [formProvider, setFormProvider] = useState('');
  const [formModelId, setFormModelId] = useState('');
  const [formWeight, setFormWeight] = useState(100);
  const [formMaxTokens, setFormMaxTokens] = useState(4096);
  const [formTemperature, setFormTemperature] = useState(0.7);
  const [saving, setSaving] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/activity-config');
      const json = await res.json();
      if (res.ok && json.data) {
        setConfigs(json.data);
      } else {
        setError(json.error || 'Failed to load configs.');
      }
    } catch {
      setError('Network error loading activity configs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleCreate = async () => {
    if (!formProvider.trim() || !formModelId.trim()) {
      showToast('error', 'Provider and Model ID are required.');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/ai/activity-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: formActivity,
          provider: formProvider.trim(),
          modelId: formModelId.trim(),
          weight: formWeight,
          maxTokens: formMaxTokens,
          temperature: formTemperature,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Create failed');
      }

      showToast('success', 'Activity config created.');
      setShowForm(false);
      fetchConfigs();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Create failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleWeightChange = async (configId: string, newWeight: number) => {
    try {
      const res = await fetch(`/api/ai/activity-config/${configId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight: newWeight }),
      });

      if (!res.ok) throw new Error('Update failed');

      setConfigs((prev) =>
        prev.map((c) => (c.id === configId ? { ...c, weight: newWeight } : c))
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Weight update failed.');
    }
  };

  const handleToggleActive = async (configId: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/ai/activity-config/${configId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });

      if (!res.ok) throw new Error('Update failed');

      setConfigs((prev) =>
        prev.map((c) => (c.id === configId ? { ...c, is_active: !isActive } : c))
      );
      showToast('success', `Config ${!isActive ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Toggle failed.');
    }
  };

  const handleDelete = async (configId: string) => {
    if (!confirm('Delete this activity config?')) return;

    try {
      const res = await fetch(`/api/ai/activity-config/${configId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Delete failed');

      setConfigs((prev) => prev.filter((c) => c.id !== configId));
      showToast('success', 'Config deleted.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  // Group configs by activity for A/B testing view
  const groupedByActivity: Record<string, AIActivityConfig[]> = {};
  for (const config of configs) {
    if (!groupedByActivity[config.activity]) groupedByActivity[config.activity] = [];
    groupedByActivity[config.activity].push(config);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading configs...
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
          <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">Activity Config</h3>
          <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
            Configure which models serve each activity. Use weights for A/B testing.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Config'}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-cream/50 dark:bg-navy/30 rounded-2xl border border-cream-dark dark:border-slate-700 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Activity</label>
              <select
                value={formActivity}
                onChange={(e) => setFormActivity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              >
                {ACTIVITY_OPTIONS.map((a) => (
                  <option key={a} value={a}>{ACTIVITY_LABELS[a] || a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Provider</label>
              <input
                type="text"
                value={formProvider}
                onChange={(e) => setFormProvider(e.target.value)}
                placeholder="e.g. openai"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Model ID</label>
              <input
                type="text"
                value={formModelId}
                onChange={(e) => setFormModelId(e.target.value)}
                placeholder="e.g. gpt-4o"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">
                Weight (A/B testing): {formWeight}
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={formWeight}
                onChange={(e) => setFormWeight(parseInt(e.target.value))}
                className="w-full accent-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Max Tokens</label>
              <input
                type="number"
                value={formMaxTokens}
                onChange={(e) => setFormMaxTokens(parseInt(e.target.value) || 4096)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">
                Temperature: {formTemperature}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={formTemperature}
                onChange={(e) => setFormTemperature(parseFloat(e.target.value))}
                className="w-full accent-electric"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleCreate} loading={saving}>
              Create Config
            </Button>
          </div>
        </div>
      )}

      {/* Grouped Activity Configs */}
      {Object.keys(groupedByActivity).length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-cream-dark px-6 py-8 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
          No activity configs yet. Add one to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByActivity).map(([activity, actConfigs]) => {
            const totalWeight = actConfigs.reduce((s, c) => s + c.weight, 0);

            return (
              <div key={activity} className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
                <div className="px-5 py-3 bg-cream/50 dark:bg-navy/50 border-b-2 border-cream-dark dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-heading font-semibold text-navy dark:text-slate-100">
                      {ACTIVITY_LABELS[activity] || activity}
                    </h4>
                    <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                      {actConfigs.length} model{actConfigs.length !== 1 ? 's' : ''} configured
                      {actConfigs.length > 1 && ' (A/B testing active)'}
                    </p>
                  </div>
                  {actConfigs.length > 1 && (
                    <div className="flex h-2 w-32 rounded-full overflow-hidden bg-cream-dark">
                      {actConfigs.map((c, i) => {
                        const pct = totalWeight > 0 ? (c.weight / totalWeight) * 100 : 0;
                        const colors = ['bg-electric', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-500'];
                        return (
                          <div
                            key={c.id}
                            className={`${colors[i % colors.length]} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="divide-y divide-cream-dark dark:divide-slate-700">
                  {actConfigs.map((config) => {
                    const pct = totalWeight > 0 ? Math.round((config.weight / totalWeight) * 100) : 0;
                    return (
                      <div key={config.id} className="px-5 py-3 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-body font-medium text-navy dark:text-slate-100">
                              {config.provider} / {config.model_id}
                            </span>
                            {!config.is_active && (
                              <span className="text-xs bg-navy/10 text-navy/40 px-1.5 py-0.5 rounded font-body">
                                Disabled
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-navy/40 dark:text-slate-500 font-body">
                            <span>Weight: {config.weight} ({pct}%)</span>
                            <span>Max tokens: {config.max_tokens}</span>
                            <span>Temp: {config.temperature}</span>
                          </div>
                        </div>

                        {/* Weight slider inline */}
                        <div className="w-24">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={config.weight}
                            onChange={(e) => handleWeightChange(config.id, parseInt(e.target.value))}
                            className="w-full accent-electric"
                            title={`Weight: ${config.weight}`}
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleActive(config.id, config.is_active)}
                            className={`
                              px-2 py-1 text-xs font-medium rounded-lg border transition-all
                              ${config.is_active
                                ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                                : 'bg-cream border-cream-dark text-navy/40 hover:text-navy/60'
                              }
                            `}
                          >
                            {config.is_active ? 'Active' : 'Inactive'}
                          </button>
                          <button
                            onClick={() => handleDelete(config.id)}
                            className="px-2 py-1 text-xs font-medium rounded-lg border border-cream-dark dark:border-slate-700 text-red-500 hover:text-red-700 hover:border-red-200 transition-all"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
