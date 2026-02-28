'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { AVAILABLE_MODELS, AGENT_ROLES, MODEL_PROFILES } from '@/lib/ai/pageforge-pipeline';
import type { SeoTeamConfig } from '@/lib/types';

interface TeamTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  phases: { name: string; is_gate?: boolean; skill_slug?: string }[];
  is_active: boolean;
  created_at: string;
}

interface TeamRun {
  id: string;
  status: string;
  current_phase: number;
  total_cost_usd: number;
  client_id: string | null;
  site_config_id: string | null;
  input_data: Record<string, unknown>;
  created_at: string;
  template: { id: string; slug: string; name: string; icon: string } | null;
  client: { id: string; name: string } | null;
  site_config: { id: string; site_name: string; site_url: string } | null;
}

interface ClientItem {
  id: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  scrapped: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function StatusBadge({ status }: { status: string }) {
  const isAwaiting = status.startsWith('awaiting_');
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const color = isAwaiting
    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    : STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

export default function TeamsDashboard() {
  const [templates, setTemplates] = useState<TeamTemplate[]>([]);
  const [runs, setRuns] = useState<TeamRun[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [siteConfigs, setSiteConfigs] = useState<SeoTeamConfig[]>([]);
  const [pfSiteProfiles, setPfSiteProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState<string>('all');

  // New Run modal state
  const [showNewRun, setShowNewRun] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSiteConfigId, setSelectedSiteConfigId] = useState('');
  const [newRunTopic, setNewRunTopic] = useState('');
  const [newRunSilo, setNewRunSilo] = useState('');
  const [starting, setStarting] = useState(false);

  // PageForge-specific fields
  const [figmaFileKey, setFigmaFileKey] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [pageSlug, setPageSlug] = useState('');
  const [modelProfile, setModelProfile] = useState('cost_optimized');
  const defaultCustomModels = MODEL_PROFILES.find(p => p.id === 'cost_optimized')!.models;
  const [customModels, setCustomModels] = useState<Record<string, string>>({ ...defaultCustomModels });

  // Derived: is the selected template PageForge?
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const isPageForge = selectedTemplate?.slug === 'pageforge';

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (clientFilter !== 'all') params.set('client_id', clientFilter);
      const runsQs = params.toString();

      const [templatesRes, runsRes, clientsRes, configsRes] = await Promise.all([
        fetch('/api/teams'),
        fetch(`/api/teams/runs${runsQs ? `?${runsQs}` : ''}`),
        fetch('/api/clients?limit=100'),
        fetch('/api/seo/configs'),
      ]);

      if (templatesRes.ok) {
        const json = await templatesRes.json();
        setTemplates(json.data || []);
      }
      if (runsRes.ok) {
        const json = await runsRes.json();
        setRuns(json.data || []);
      }
      if (clientsRes.ok) {
        const json = await clientsRes.json();
        const list = json.data?.clients || json.data || [];
        setClients(list.map((c: ClientItem) => ({ id: c.id, name: c.name })));
      }
      if (configsRes.ok) {
        const json = await configsRes.json();
        setSiteConfigs(json.data || []);
      }

      // Fetch PageForge site profiles
      try {
        const pfSitesRes = await fetch('/api/pageforge/sites');
        if (pfSitesRes.ok) {
          const json = await pfSitesRes.json();
          setPfSiteProfiles(json.sites || []);
        }
      } catch {
        // PageForge sites endpoint may not exist yet
      }
    } catch (err) {
      console.error('Failed to fetch teams data:', err);
    }
    setLoading(false);
  }, [clientFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime updates for runs (agent_team_runs + pageforge_builds)
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('teams-dashboard-runs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_team_runs' },
        () => { fetchData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pageforge_builds' },
        () => { fetchData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // Filter site configs by selected client in the modal
  const filteredSiteConfigs = selectedClientId
    ? siteConfigs.filter(c => c.client_id === selectedClientId)
    : siteConfigs;

  const handleStartRun = async () => {
    if (!selectedTemplateId) return;

    // Validate required fields based on template type
    if (isPageForge) {
      if (!pageTitle.trim() || !figmaFileKey.trim()) return;
    } else {
      if (!newRunTopic.trim()) return;
    }

    setStarting(true);

    try {
      const pageForgeInputData: Record<string, unknown> = {
        figma_file_key: figmaFileKey.trim(),
        page_title: pageTitle.trim(),
        page_slug: pageSlug.trim() || undefined,
        model_profile: modelProfile,
      };
      if (modelProfile === 'custom') {
        pageForgeInputData.custom_models = customModels;
      }
      const payload = isPageForge
        ? {
            template_id: selectedTemplateId,
            client_id: selectedClientId || undefined,
            site_config_id: selectedSiteConfigId || undefined,
            input_data: pageForgeInputData,
          }
        : {
            template_id: selectedTemplateId,
            client_id: selectedClientId || undefined,
            site_config_id: selectedSiteConfigId || undefined,
            input_data: {
              topic: newRunTopic.trim(),
              silo: newRunSilo.trim() || undefined,
            },
          };

      const res = await fetch('/api/teams/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowNewRun(false);
        setNewRunTopic('');
        setNewRunSilo('');
        setFigmaFileKey('');
        setPageTitle('');
        setPageSlug('');
        setModelProfile('cost_optimized');
        setCustomModels({ ...defaultCustomModels });
        setSelectedClientId('');
        setSelectedSiteConfigId('');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to start run:', err);
    }
    setStarting(false);
  };

  const activeRuns = runs.filter(r => !['completed', 'failed', 'scrapped'].includes(r.status));
  const pendingApprovals = runs.filter(r => r.status.startsWith('awaiting_'));

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-navy dark:text-white font-heading">Agent Teams</h1>
          <p className="text-xs md:text-sm text-navy/50 dark:text-slate-400 mt-1 font-body">
            Reusable multi-phase AI pipelines
          </p>
        </div>
        <button
          onClick={() => setShowNewRun(true)}
          disabled={templates.length === 0}
          className="shrink-0 px-4 py-2 text-sm font-semibold text-white bg-electric rounded-lg hover:bg-electric-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-body"
        >
          + New Run
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Templates', value: templates.length, color: 'text-electric' },
          { label: 'Active Runs', value: activeRuns.length, color: 'text-blue-600' },
          { label: 'Pending Approvals', value: pendingApprovals.length, color: 'text-yellow-600' },
          { label: 'Completed', value: runs.filter(r => r.status === 'completed').length, color: 'text-green-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 font-heading ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Client Filter */}
      {clients.length > 1 && (
        <div className="flex items-center gap-3">
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 border border-cream-dark dark:border-slate-700 font-body"
          >
            <option value="all">All Clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-3 font-heading">
            Pending Approvals ({pendingApprovals.length})
          </h2>
          <div className="space-y-2">
            {pendingApprovals.map(run => (
              <Link
                key={run.id}
                href={run.template?.slug === 'pageforge' ? `/pageforge/builds/${run.id}` : `/teams/runs/${run.id}`}
                className="flex items-center justify-between p-3 bg-white dark:bg-dark-card rounded-lg hover:bg-cream dark:hover:bg-slate-700 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy dark:text-white font-heading truncate">
                    {run.template?.name || 'Unknown Template'}
                  </p>
                  <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
                    {run.client?.name && <span className="mr-2">{run.client.name}</span>}
                    {run.site_config?.site_name && <span className="mr-2">- {run.site_config.site_name}</span>}
                    {(run.input_data as { topic?: string })?.topic || ''}
                  </p>
                </div>
                <StatusBadge status={run.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Templates */}
      <div>
        <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading uppercase tracking-wider">
          Available Templates
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(t => (
            <div key={t.id} className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-navy dark:text-white font-heading">{t.name}</h3>
                <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                  {t.phases.length} phases
                </span>
              </div>
              <p className="text-xs text-navy/50 dark:text-slate-400 font-body mb-3 line-clamp-2">{t.description}</p>
              <div className="flex items-center gap-1 flex-wrap">
                {t.phases.map((phase, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div
                      className={`px-1.5 md:px-2 py-0.5 rounded text-[9px] md:text-[10px] font-medium whitespace-nowrap ${
                        phase.is_gate
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                          : 'bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400'
                      }`}
                      title={phase.skill_slug || 'Gate'}
                    >
                      {phase.name}
                    </div>
                    {i < t.phases.length - 1 && (
                      <span className="text-navy/20 dark:text-slate-600 text-[10px] hidden sm:inline">&rarr;</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Runs */}
      <div>
        <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading uppercase tracking-wider">
          Recent Runs
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-6 w-6 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-navy/40 dark:text-slate-500 font-body">No team runs yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map(run => (
              <Link
                key={run.id}
                href={run.template?.slug === 'pageforge' ? `/pageforge/builds/${run.id}` : `/teams/runs/${run.id}`}
                className="flex items-center justify-between p-3 md:p-4 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 hover:border-electric dark:hover:border-electric transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-navy dark:text-white truncate font-heading">
                      {run.template?.name || 'Unknown'}
                    </p>
                    <StatusBadge status={run.status} />
                  </div>
                  <p className="text-xs text-navy/40 dark:text-slate-500 mt-1 font-body">
                    {run.client?.name && (
                      <span className="mr-2 text-navy/50 dark:text-slate-400">{run.client.name}</span>
                    )}
                    {run.site_config?.site_name && (
                      <span className="mr-2">{run.site_config.site_name}</span>
                    )}
                    {(run.input_data as { topic?: string })?.topic && (
                      <span className="mr-2">- {(run.input_data as { topic?: string }).topic}</span>
                    )}
                    <span>{new Date(run.created_at).toLocaleDateString()} - Phase {run.current_phase + 1}</span>
                  </p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  {run.total_cost_usd > 0 && (
                    <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                      ${run.total_cost_usd.toFixed(2)}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* New Run Modal */}
      {showNewRun && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNewRun(false)}>
          <div className="bg-white dark:bg-dark-card rounded-xl p-5 md:p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-navy dark:text-white mb-4 font-heading">Start Team Run</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Template</label>
                <select
                  value={selectedTemplateId}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body"
                >
                  <option value="">Select a template...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.phases.length} phases)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Client</label>
                <select
                  value={selectedClientId}
                  onChange={e => { setSelectedClientId(e.target.value); setSelectedSiteConfigId(''); }}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body"
                >
                  <option value="">Select a client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {/* Target Site - shows PageForge site profiles or SEO configs depending on template */}
              {isPageForge ? (
                pfSiteProfiles.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Site Profile</label>
                    <select
                      value={selectedSiteConfigId}
                      onChange={e => setSelectedSiteConfigId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body"
                    >
                      <option value="">Select a site profile...</option>
                      {pfSiteProfiles.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.site_name} ({p.site_url})
                        </option>
                      ))}
                    </select>
                  </div>
                )
              ) : (
                filteredSiteConfigs.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Target Site</label>
                    <select
                      value={selectedSiteConfigId}
                      onChange={e => setSelectedSiteConfigId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body"
                    >
                      <option value="">Select a site...</option>
                      {filteredSiteConfigs.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.site_name} ({c.site_url})
                        </option>
                      ))}
                    </select>
                  </div>
                )
              )}

              {/* PageForge-specific fields */}
              {isPageForge ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Page Title</label>
                    <input
                      type="text"
                      value={pageTitle}
                      onChange={e => setPageTitle(e.target.value)}
                      placeholder="e.g., About Us"
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 font-body"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Figma File Key</label>
                    <input
                      type="text"
                      value={figmaFileKey}
                      onChange={e => setFigmaFileKey(e.target.value)}
                      placeholder="e.g., abc123XYZ..."
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 font-body"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Page Slug (optional)</label>
                    <input
                      type="text"
                      value={pageSlug}
                      onChange={e => setPageSlug(e.target.value)}
                      placeholder="e.g., about-us"
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 font-body"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Model Profile</label>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { value: 'cost_optimized', label: 'Cost-Optimized' },
                        { value: 'quality_first', label: 'Quality-First' },
                        { value: 'budget', label: 'Budget' },
                        { value: 'custom', label: 'Custom' },
                      ].map(opt => (
                        <label
                          key={opt.value}
                          className={`flex-1 text-center px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors border ${
                            modelProfile === opt.value
                              ? 'bg-electric text-white border-electric'
                              : 'bg-white dark:bg-dark-surface text-navy/60 dark:text-slate-400 border-cream-dark dark:border-slate-700 hover:border-electric/50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="modelProfile"
                            value={opt.value}
                            checked={modelProfile === opt.value}
                            onChange={e => setModelProfile(e.target.value)}
                            className="sr-only"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                    {/* Custom per-agent model picker */}
                    {modelProfile === 'custom' && (
                      <div className="mt-3 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-dark-surface/50 p-3 space-y-2.5">
                        <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">
                          Per-Agent Model Selection
                        </p>
                        {AGENT_ROLES.map((role) => (
                          <div key={role.key} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-navy dark:text-slate-200 font-heading">
                                {role.label}
                              </p>
                              <p className="text-[10px] text-navy/40 dark:text-slate-500 truncate font-body">
                                {role.description}
                              </p>
                            </div>
                            <select
                              value={customModels[role.key] || ''}
                              onChange={(e) =>
                                setCustomModels((prev) => ({ ...prev, [role.key]: e.target.value }))
                              }
                              className="shrink-0 w-44 rounded-md border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-xs text-navy dark:text-slate-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-electric/40 font-body"
                            >
                              {AVAILABLE_MODELS.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Topic</label>
                    <input
                      type="text"
                      value={newRunTopic}
                      onChange={e => setNewRunTopic(e.target.value)}
                      placeholder="e.g., Best practices for local SEO in 2026"
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 font-body"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Silo (optional)</label>
                    <input
                      type="text"
                      value={newRunSilo}
                      onChange={e => setNewRunSilo(e.target.value)}
                      placeholder="e.g., Local SEO"
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 font-body"
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowNewRun(false)}
                  className="px-4 py-2 text-sm text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white transition-colors font-body"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartRun}
                  disabled={starting || !selectedTemplateId || (isPageForge ? (!pageTitle.trim() || !figmaFileKey.trim()) : !newRunTopic.trim())}
                  className="px-4 py-2 text-sm font-semibold text-white bg-electric rounded-lg hover:bg-electric-dark transition-colors disabled:opacity-50 font-body"
                >
                  {starting ? 'Starting...' : 'Start Run'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
