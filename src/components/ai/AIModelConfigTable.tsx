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

// ============================================================================
// Team Hierarchy
// ============================================================================

interface TeamGroup {
  id: string;
  label: string;
  icon: string;
  description: string;
  activities: AIActivity[];
}

const TEAMS: TeamGroup[] = [
  {
    id: 'chatbot',
    label: 'Chatbot & Assistants',
    icon: '💬',
    description: 'AI-powered chat across tickets, boards, and global search',
    activities: ['chatbot_ticket', 'chatbot_board', 'chatbot_global', 'brief_assist', 'email_draft'],
  },
  {
    id: 'agents',
    label: 'Agent Execution',
    icon: '🤖',
    description: 'Autonomous agent tasks, web research, and standalone runs',
    activities: ['agent_execution', 'agent_standalone_execution', 'web_research'],
  },
  {
    id: 'review',
    label: 'Design & QA Review',
    icon: '🎨',
    description: 'AI-powered design review and dev QA checks',
    activities: ['design_review', 'dev_qa'],
  },
  {
    id: 'pageforge',
    label: 'PageForge',
    icon: '🏗️',
    description: 'Website building pipeline - orchestration, building, QA, SEO',
    activities: ['pageforge_orchestrator', 'pageforge_builder', 'pageforge_vqa', 'pageforge_qa', 'pageforge_seo'],
  },
  {
    id: 'content',
    label: 'Content & Creative',
    icon: '✨',
    description: 'Image generation, video, and creative writing',
    activities: ['nano_banana_edit', 'nano_banana_generate', 'video_generation', 'replicate_generate', 'image_prompt_enhance'],
  },
  {
    id: 'knowledge',
    label: 'Knowledge & Intelligence',
    icon: '🧠',
    description: 'Embeddings, indexing, client brain, and board summaries',
    activities: ['knowledge_index', 'board_summary', 'client_brain', 'fathom_analysis', 'fathom_embedding'],
  },
];

// ============================================================================
// Defaults
// ============================================================================

const DEFAULTS: Record<AIActivity, { provider: AIProvider; model_id: string; temperature: number; max_tokens: number }> = {
  design_review: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.3, max_tokens: 4096 },
  dev_qa: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.2, max_tokens: 4096 },
  chatbot_ticket: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 2048 },
  chatbot_board: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 4096 },
  chatbot_global: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.7, max_tokens: 4096 },
  client_brain: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.5, max_tokens: 4096 },
  nano_banana_edit: { provider: 'google', model_id: 'gemini-2.5-flash', temperature: 0.7, max_tokens: 1024 },
  nano_banana_generate: { provider: 'google', model_id: 'gemini-2.5-flash', temperature: 0.8, max_tokens: 1024 },
  email_draft: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.6, max_tokens: 2048 },
  video_generation: { provider: 'openai', model_id: 'sora-2', temperature: 0.7, max_tokens: 1024 },
  brief_assist: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.5, max_tokens: 1024 },
  agent_execution: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.4, max_tokens: 8192 },
  agent_standalone_execution: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.4, max_tokens: 8192 },
  web_research: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.3, max_tokens: 8192 },
  replicate_generate: { provider: 'replicate', model_id: 'flux-1.1-pro', temperature: 0.8, max_tokens: 1024 },
  image_prompt_enhance: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.7, max_tokens: 1024 },
  knowledge_index: { provider: 'openai', model_id: 'text-embedding-3-small', temperature: 0, max_tokens: 0 },
  board_summary: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.3, max_tokens: 600 },
  pageforge_orchestrator: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.3, max_tokens: 8192 },
  pageforge_builder: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.4, max_tokens: 8192 },
  pageforge_vqa: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.2, max_tokens: 4096 },
  pageforge_qa: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.2, max_tokens: 4096 },
  pageforge_seo: { provider: 'anthropic', model_id: 'claude-haiku-4-5-20251001', temperature: 0.3, max_tokens: 4096 },
  fathom_analysis: { provider: 'anthropic', model_id: 'claude-sonnet-4-5-20250929', temperature: 0.3, max_tokens: 4096 },
  fathom_embedding: { provider: 'openai', model_id: 'text-embedding-3-small', temperature: 0, max_tokens: 0 },
};

function getModelsForProvider(provider: AIProvider): string[] {
  return MODEL_PRICING
    .filter((p) => p.provider === provider)
    .map((p) => p.model_id);
}

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

// ============================================================================
// Provider badge colors
// ============================================================================

function providerBadge(provider: string) {
  const colors: Record<string, string> = {
    anthropic: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
    openai: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
    google: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    replicate: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  };
  return colors[provider] || 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800';
}

// ============================================================================
// Component
// ============================================================================

export default function AIModelConfigTable() {
  const [configs, setConfigs] = useState<AIModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set(TEAMS.map(t => t.id)));

  // Edit modal state
  const [editConfig, setEditConfig] = useState<AIModelConfig | null>(null);
  const [editActivity, setEditActivity] = useState<AIActivity | null>(null);
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
      if (json.data) setConfigs(json.data);
    } catch {
      showToast('error', 'Failed to load model configurations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const toggleTeam = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const expandAll = () => setExpandedTeams(new Set(TEAMS.map(t => t.id)));
  const collapseAll = () => setExpandedTeams(new Set());

  const getConfigForActivity = (activity: AIActivity): AIModelConfig | null => {
    return configs.find((c) => c.activity === activity) || null;
  };

  const openEdit = (activity: AIActivity) => {
    const config = getConfigForActivity(activity);
    const def = DEFAULTS[activity];
    setEditActivity(activity);
    setEditConfig(config);
    setEditProvider(config?.provider || def.provider);
    setEditModelId(config?.model_id || def.model_id);
    setEditTemp(String(config ? Number(config.temperature) : def.temperature));
    setEditMaxTokens(String(config?.max_tokens || def.max_tokens));
  };

  const handleSaveEdit = async () => {
    if (!editActivity) return;
    setSaving(true);
    try {
      const config = getConfigForActivity(editActivity);
      const method = config ? 'PUT' : 'POST';
      const url = config ? `/api/ai/models/${config.id}` : '/api/ai/models';
      const body: Record<string, unknown> = {
        provider: editProvider,
        model_id: editModelId,
        temperature: parseFloat(editTemp),
        max_tokens: parseInt(editMaxTokens, 10),
      };
      if (!config) body.activity = editActivity;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save config');
      }
      showToast('success', `${ACTIVITY_LABELS[editActivity]} model config saved.`);
      setEditActivity(null);
      setEditConfig(null);
      await fetchConfigs();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save config.');
    } finally {
      setSaving(false);
    }
  };

  // Count customized vs total for each team
  function teamStats(team: TeamGroup) {
    let customized = 0;
    for (const a of team.activities) {
      const config = getConfigForActivity(a);
      if (config && !isDefaultConfig(config)) customized++;
    }
    return { total: team.activities.length, customized };
  }

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
    <div className="space-y-4">
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
            {toast.type === 'success' ? '✅' : '❌'}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header with expand/collapse */}
      <div className="flex items-center justify-between">
        <p className="text-navy/50 dark:text-slate-400 font-body text-sm">
          {TEAMS.length} teams · {getAllActivities().length} agents
        </p>
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="text-xs text-electric hover:underline font-body">Expand All</button>
          <span className="text-navy/20 dark:text-slate-600">·</span>
          <button onClick={collapseAll} className="text-xs text-electric hover:underline font-body">Collapse All</button>
        </div>
      </div>

      {/* Team Cards */}
      {TEAMS.map((team) => {
        const expanded = expandedTeams.has(team.id);
        const stats = teamStats(team);

        return (
          <div
            key={team.id}
            className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden transition-all duration-200"
          >
            {/* Team Header */}
            <button
              onClick={() => toggleTeam(team.id)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{team.icon}</span>
                <div>
                  <h3 className="font-heading font-semibold text-navy dark:text-slate-100 text-base">
                    {team.label}
                  </h3>
                  <p className="text-navy/50 dark:text-slate-400 font-body text-xs mt-0.5">
                    {team.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {stats.customized > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-electric/10 text-electric border border-electric/20">
                    {stats.customized} customized
                  </span>
                )}
                <span className="text-navy/30 dark:text-slate-500 font-body text-xs">
                  {stats.total} agents
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`text-navy/30 dark:text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>

            {/* Activity List (collapsible) */}
            {expanded && (
              <div className="border-t-2 border-cream-dark dark:border-slate-700">
                {team.activities.map((activity, idx) => {
                  const config = getConfigForActivity(activity);
                  const def = DEFAULTS[activity];
                  const provider = config?.provider || def.provider;
                  const modelId = config?.model_id || def.model_id;
                  const temperature = config ? Number(config.temperature) : def.temperature;
                  const maxTokens = config?.max_tokens || def.max_tokens;
                  const isDefault = config ? isDefaultConfig(config) : true;

                  return (
                    <div
                      key={activity}
                      className={`
                        flex items-center justify-between px-6 py-3 hover:bg-cream/20 dark:hover:bg-slate-800/20 transition-colors cursor-pointer
                        ${idx < team.activities.length - 1 ? 'border-b border-cream-dark/50 dark:border-slate-700/50' : ''}
                      `}
                      onClick={() => openEdit(activity)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-navy/20 dark:bg-slate-600 flex-shrink-0" />
                        <span className="font-body font-medium text-navy dark:text-slate-100 text-sm truncate">
                          {ACTIVITY_LABELS[activity]}
                        </span>
                        {isDefault && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-navy/5 text-navy/40 border border-navy/10 flex-shrink-0">
                            Default
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Provider badge */}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${providerBadge(provider)}`}>
                          {PROVIDER_LABELS[provider] || provider}
                        </span>

                        {/* Model */}
                        <span className="font-mono text-xs text-navy/60 dark:text-slate-400 w-48 text-right truncate hidden sm:block">
                          {modelId}
                        </span>

                        {/* Temp & tokens - hidden on small screens */}
                        <span className="text-navy/40 dark:text-slate-500 text-xs w-10 text-center hidden lg:block">
                          {temperature}
                        </span>
                        <span className="text-navy/40 dark:text-slate-500 text-xs w-16 text-right hidden lg:block">
                          {maxTokens > 0 ? maxTokens.toLocaleString() : '—'}
                        </span>

                        {/* Edit icon */}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-navy/20 dark:text-slate-600"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Edit Model Config Modal */}
      <Modal
        isOpen={!!editActivity}
        onClose={() => { setEditActivity(null); setEditConfig(null); }}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-1">
            Configure Model
          </h3>
          {editActivity && (
            <p className="text-navy/50 dark:text-slate-400 font-body text-sm mb-6">
              {ACTIVITY_LABELS[editActivity]}
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
                  if (models.length > 0) setEditModelId(models[0]);
                }}
                className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30"><polyline points="6 9 12 15 18 9" /></svg>
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
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30"><polyline points="6 9 12 15 18 9" /></svg>
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
            <Button variant="ghost" size="md" onClick={() => { setEditActivity(null); setEditConfig(null); }}>
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
