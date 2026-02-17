'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AIActivity, AIProvider, AIModelConfig } from '@/lib/types';
import { ACTIVITY_LABELS, getAllActivities } from '@/lib/ai/model-resolver';
import { MODEL_PRICING } from '@/lib/ai/cost-tracker';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'google'];

const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  browserless: 'Browserless',
  replicate: 'Replicate',
};

function getModelsForProvider(provider: AIProvider): string[] {
  return MODEL_PRICING
    .filter((p) => p.provider === provider)
    .map((p) => p.model_id);
}

// Hardcoded defaults to detect unmodified configs
const DEFAULTS: Record<AIActivity, { provider: AIProvider; model_id: string; temperature: number; max_tokens: number }> = {
  design_review: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.3, max_tokens: 4096 },
  dev_qa: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.2, max_tokens: 4096 },
  chatbot_ticket: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 2048 },
  chatbot_board: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 4096 },
  chatbot_global: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 4096 },
  client_brain: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.5, max_tokens: 4096 },
  nano_banana_edit: { provider: 'google', model_id: 'gemini-2.0-flash-exp', temperature: 0.7, max_tokens: 1024 },
  nano_banana_generate: { provider: 'google', model_id: 'gemini-2.0-flash-exp', temperature: 0.8, max_tokens: 1024 },
  email_draft: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.6, max_tokens: 2048 },
  video_generation: { provider: 'openai', model_id: 'sora-2', temperature: 0.7, max_tokens: 1024 },
  brief_assist: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.5, max_tokens: 1024 },
  agent_execution: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.4, max_tokens: 8192 },
  agent_standalone_execution: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.4, max_tokens: 8192 },
  web_research: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.3, max_tokens: 8192 },
  replicate_generate: { provider: 'replicate', model_id: 'flux-1.1-pro', temperature: 0.8, max_tokens: 1024 },
  image_prompt_enhance: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.7, max_tokens: 1024 },
};

function isDefaultConfig(config: AIModelConfig): boolean {
  const def = DEFAULTS[config.activity];
  if (!def) return false;
  return (
    config.provider === def.provider &&
    config.model_id === def.model_id &&
    Number(config.temperature) === def.temperature &&
    config.max_tokens === def.max_tokens
  );
}

export default function AIModelConfigTable() {
  const [configs, setConfigs] = useState<AIModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Edit modal state
  const [editConfig, setEditConfig] = useState<AIModelConfig | null>(null);
  const [editProvider, setEditProvider] = useState<AIProvider>('anthropic');
  const [editModelId, setEditModelId] = useState('');
  const [editTemp, setEditTemp] = useState('0.5');
  const [editMaxTokens, setEditMaxTokens] = useState('4096');
  const [saving, setSaving] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/models');
      const json = await res.json();
      if (json.data) {
        setConfigs(json.data);
      }
    } catch {
      showToast('error', 'Failed to load model configurations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const openEdit = (config: AIModelConfig) => {
    setEditConfig(config);
    setEditProvider(config.provider);
    setEditModelId(config.model_id);
    setEditTemp(String(config.temperature));
    setEditMaxTokens(String(config.max_tokens));
  };

  const handleSaveEdit = async () => {
    if (!editConfig) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ai/models/${editConfig.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: editProvider,
          model_id: editModelId,
          temperature: parseFloat(editTemp),
          max_tokens: parseInt(editMaxTokens, 10),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update config');
      }
      showToast('success', `Model config for ${ACTIVITY_LABELS[editConfig.activity]} updated.`);
      setEditConfig(null);
      await fetchConfigs();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update config.');
    } finally {
      setSaving(false);
    }
  };

  // Build a merged list: all activities, with DB config if it exists, or default fallback
  const allActivities = getAllActivities();

  const getConfigForActivity = (activity: AIActivity): AIModelConfig | null => {
    return configs.find((c) => c.activity === activity) || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading model configurations...
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

      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
                <th className="text-left px-6 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Activity</th>
                <th className="text-left px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Provider</th>
                <th className="text-left px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Model</th>
                <th className="text-center px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Temp</th>
                <th className="text-center px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Max Tokens</th>
                <th className="text-right px-6 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-dark dark:divide-slate-700">
              {allActivities.map((activity) => {
                const config = getConfigForActivity(activity);
                const def = DEFAULTS[activity];
                const provider = config?.provider || def.provider;
                const modelId = config?.model_id || def.model_id;
                const temperature = config ? Number(config.temperature) : def.temperature;
                const maxTokens = config?.max_tokens || def.max_tokens;
                const isDefault = config ? isDefaultConfig(config) : true;

                return (
                  <tr key={activity} className="hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-body font-medium text-navy dark:text-slate-100">
                          {ACTIVITY_LABELS[activity]}
                        </span>
                        {isDefault && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-navy/5 text-navy/40 border border-navy/10">
                            Default
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-body text-navy/70 dark:text-slate-300">
                        {PROVIDER_LABELS[provider] || provider}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-body text-navy/70 dark:text-slate-300 font-mono text-xs">
                        {modelId}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="font-body text-navy/70 dark:text-slate-300">{temperature}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="font-body text-navy/70 dark:text-slate-300">{maxTokens.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {config ? (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(config)}>
                          Edit
                        </Button>
                      ) : (
                        <span className="text-navy/30 dark:text-slate-500 font-body text-xs">No DB config</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Model Config Modal */}
      <Modal
        isOpen={!!editConfig}
        onClose={() => setEditConfig(null)}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-1">
            Edit Model Configuration
          </h3>
          {editConfig && (
            <p className="text-navy/50 dark:text-slate-400 font-body text-sm mb-6">
              {ACTIVITY_LABELS[editConfig.activity]}
            </p>
          )}

          {/* Provider */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
              Provider
            </label>
            <div className="relative">
              <select
                value={editProvider}
                onChange={(e) => {
                  const newProvider = e.target.value as AIProvider;
                  setEditProvider(newProvider);
                  const models = getModelsForProvider(newProvider);
                  if (models.length > 0) {
                    setEditModelId(models[0]);
                  }
                }}
                className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>

          {/* Model */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
              Model
            </label>
            <div className="relative">
              <select
                value={editModelId}
                onChange={(e) => setEditModelId(e.target.value)}
                className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              >
                {getModelsForProvider(editProvider).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>

          {/* Temperature */}
          <div className="mb-4">
            <Input
              label="Temperature"
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={editTemp}
              onChange={(e) => setEditTemp(e.target.value)}
            />
            <p className="text-navy/40 dark:text-slate-500 font-body text-xs mt-1">0 = deterministic, 2 = most creative</p>
          </div>

          {/* Max Tokens */}
          <div className="mb-6">
            <Input
              label="Max Tokens"
              type="number"
              min="256"
              max="32768"
              step="256"
              value={editMaxTokens}
              onChange={(e) => setEditMaxTokens(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setEditConfig(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={!editModelId}
              onClick={handleSaveEdit}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
