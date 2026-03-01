'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  const [error, setError] = useState<string | null>(null);
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
  const [pageBuilder, setPageBuilder] = useState('');
  const [modelProfile, setModelProfile] = useState('cost_optimized');
  const defaultCustomModels = MODEL_PROFILES.find(p => p.id === 'cost_optimized')!.models;
  const [customModels, setCustomModels] = useState<Record<string, string>>({ ...defaultCustomModels });
  const [trackOnBoard, setTrackOnBoard] = useState(false);

  // Figma files combobox
  const [figmaFiles, setFigmaFiles] = useState<Array<{ key: string; name: string; thumbnail_url: string | null; last_modified: string; project_name: string }>>([]);
  const [figmaFilesLoading, setFigmaFilesLoading] = useState(false);
  const [figmaSearch, setFigmaSearch] = useState('');
  const [figmaSelectedName, setFigmaSelectedName] = useState('');
  const [showFigmaDropdown, setShowFigmaDropdown] = useState(false);
  const figmaDropdownRef = useRef<HTMLDivElement>(null);

  // Derived: is the selected template PageForge?
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const isPageForge = selectedTemplate?.slug === 'pageforge';

  // Close Figma dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (figmaDropdownRef.current && !figmaDropdownRef.current.contains(e.target as Node)) {
        setShowFigmaDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch Figma files when PF site profile changes
  useEffect(() => {
    if (!isPageForge || !selectedSiteConfigId) {
      setFigmaFiles([]);
      return;
    }
    let cancelled = false;
    async function loadFiles() {
      setFigmaFilesLoading(true);
      try {
        const res = await fetch(`/api/pageforge/figma/files?siteProfileId=${selectedSiteConfigId}`);
        const json = await res.json();
        if (!cancelled && json.files) setFigmaFiles(json.files);
      } catch { /* silent */ }
      finally { if (!cancelled) setFigmaFilesLoading(false); }
    }
    loadFiles();
    return () => { cancelled = true; };
  }, [isPageForge, selectedSiteConfigId]);

  const filteredFigmaFiles = figmaSearch
    ? figmaFiles.filter(f =>
        f.name.toLowerCase().includes(figmaSearch.toLowerCase()) ||
        f.project_name.toLowerCase().includes(figmaSearch.toLowerCase())
      )
    : figmaFiles;

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
      } catch { /* PageForge sites endpoint may not exist yet */ }
    } catch (err) {
      console.error('Failed to fetch teams data:', err);
    }
    setLoading(false);
  }, [clientFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime updates for runs
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

    if (isPageForge) {
      if (!pageTitle.trim() || !figmaFileKey.trim()) return;
    } else {
      if (!newRunTopic.trim()) return;
    }

    setStarting(true);
    setError(null);

    try {
      const pageForgeInputData: Record<string, unknown> = {
        figma_file_key: figmaFileKey.trim(),
        page_title: pageTitle.trim(),
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

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || errBody?.message || `Start failed (${res.status})`);
      }

      setShowNewRun(false);
      setNewRunTopic('');
      setNewRunSilo('');
      setFigmaFileKey('');
      setFigmaSearch('');
      setFigmaSelectedName('');
      setShowFigmaDropdown(false);
      setPageTitle('');
      setPageBuilder('');
      setModelProfile('cost_optimized');
      setCustomModels({ ...defaultCustomModels });
      setTrackOnBoard(false);
      setSelectedClientId('');
      setSelectedSiteConfigId('');
      fetchData();
    } catch (err) {
      console.error('Failed to start run:', err);
      setError(err instanceof Error ? err.message : 'Failed to start run');
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
          className="shrink-0 px-4 py-2 text-sm font-semibold text-white bg-electric rounded-lg hover:bg-electric-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-heading"
        >
          + New Run
        </button>
      </div>

      {/* Error banner */}
      {error && !showNewRun && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">x</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Templates', value: templates.length, color: 'text-electric' },
          { label: 'Active Runs', value: activeRuns.length, color: 'text-blue-600' },
          { label: 'Pending Approvals', value: pendingApprovals.length, color: 'text-yellow-600' },
          { label: 'Completed', value: runs.filter(r => r.status === 'completed').length, color: 'text-green-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
            <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">{stat.label}</p>
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
                href={run.template?.slug === 'pageforge' ? `/pageforge/${run.id}` : `/teams/runs/${run.id}`}
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
            <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
            <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No team runs yet</p>
            <p className="text-xs text-navy/30 dark:text-slate-600 mt-1">Start a new run to get going</p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map(run => (
              <Link
                key={run.id}
                href={run.template?.slug === 'pageforge' ? `/pageforge/${run.id}` : `/teams/runs/${run.id}`}
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

      {/* New Run Modal - styled to match PageForge wizard */}
      {showNewRun && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[2vh] sm:pt-[5vh] md:pt-[10vh] px-2 sm:px-4">
          <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm dark:bg-black/70" onClick={() => setShowNewRun(false)} />
          <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[92vh] sm:max-h-[88vh] md:max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-dark-surface px-6 pt-5 pb-4 border-b border-cream-dark dark:border-slate-700 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">New Run</h2>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
                    Start a multi-phase AI pipeline
                  </p>
                </div>
                <button
                  onClick={() => setShowNewRun(false)}
                  className="text-navy/30 dark:text-slate-600 hover:text-navy/60 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Error inside modal */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5 flex items-center justify-between">
                  <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-sm leading-none ml-2">x</button>
                </div>
              )}

              {/* Template selector */}
              <div>
                <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">Template</label>
                <select
                  value={selectedTemplateId}
                  onChange={e => { setSelectedTemplateId(e.target.value); setSelectedSiteConfigId(''); }}
                  className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                >
                  <option value="">Select a template...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.phases.length} phases)</option>
                  ))}
                </select>
              </div>

              {/* Client */}
              <div>
                <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">Client</label>
                <select
                  value={selectedClientId}
                  onChange={e => { setSelectedClientId(e.target.value); setSelectedSiteConfigId(''); }}
                  className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                >
                  <option value="">Select a client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Target Site - PageForge profiles or SEO configs */}
              {isPageForge ? (
                pfSiteProfiles.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">Site Profile</label>
                    <select
                      value={selectedSiteConfigId}
                      onChange={e => {
                        setSelectedSiteConfigId(e.target.value);
                        const site = pfSiteProfiles.find((p: any) => p.id === e.target.value);
                        if (site) setPageBuilder(site.page_builder || '');
                        setFigmaSearch('');
                        setFigmaSelectedName('');
                        setFigmaFileKey('');
                      }}
                      className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                    >
                      <option value="">Select a site profile...</option>
                      {pfSiteProfiles.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.site_name} ({p.page_builder})</option>
                      ))}
                    </select>
                  </div>
                )
              ) : (
                filteredSiteConfigs.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">Target Site</label>
                    <select
                      value={selectedSiteConfigId}
                      onChange={e => setSelectedSiteConfigId(e.target.value)}
                      className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                    >
                      <option value="">Select a site...</option>
                      {filteredSiteConfigs.map(c => (
                        <option key={c.id} value={c.id}>{c.site_name} ({c.site_url})</option>
                      ))}
                    </select>
                  </div>
                )
              )}

              {/* PageForge-specific fields */}
              {isPageForge ? (
                <>
                  {/* Figma File */}
                  <div className="relative" ref={figmaDropdownRef}>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">Figma File</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={figmaSearch || figmaSelectedName || figmaFileKey}
                        onChange={e => {
                          const val = e.target.value;
                          setFigmaSearch(val);
                          setFigmaSelectedName('');
                          const figmaUrlMatch = val.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/);
                          if (figmaUrlMatch) {
                            setFigmaFileKey(figmaUrlMatch[1]);
                          } else {
                            setFigmaFileKey(val);
                          }
                          setShowFigmaDropdown(true);
                        }}
                        onFocus={() => { if (figmaFiles.length > 0) setShowFigmaDropdown(true); }}
                        placeholder={
                          !selectedSiteConfigId
                            ? 'Select a site first'
                            : figmaFilesLoading
                              ? 'Loading Figma files...'
                              : figmaFiles.length > 0
                                ? 'Search or pick a Figma file...'
                                : 'Paste file key or Figma URL'
                        }
                        disabled={!selectedSiteConfigId}
                        className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 pr-8 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      {figmaFilesLoading && (
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
                      )}
                      {!figmaFilesLoading && figmaFiles.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowFigmaDropdown(!showFigmaDropdown)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-navy/30 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                      )}
                      {figmaSelectedName && (
                        <button
                          type="button"
                          onClick={() => { setFigmaSearch(''); setFigmaSelectedName(''); setFigmaFileKey(''); }}
                          className="absolute right-8 top-1/2 -translate-y-1/2 text-navy/30 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                    {!figmaFilesLoading && figmaFiles.length > 0 && !showFigmaDropdown && (
                      <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1 font-body">{figmaFiles.length} files available</p>
                    )}
                    {showFigmaDropdown && filteredFigmaFiles.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-lg">
                        {filteredFigmaFiles.slice(0, 50).map((file) => (
                          <button
                            key={file.key}
                            type="button"
                            onClick={() => {
                              setFigmaFileKey(file.key);
                              setFigmaSelectedName(file.name);
                              setFigmaSearch('');
                              setShowFigmaDropdown(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-cream dark:hover:bg-slate-800 transition-colors border-b border-cream-dark/30 dark:border-slate-700/30 last:border-b-0"
                          >
                            {file.thumbnail_url ? (
                              <img src={file.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-cream dark:bg-slate-800" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-cream dark:bg-slate-800 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 dark:text-slate-600"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-navy dark:text-slate-100 truncate font-body">{file.name}</p>
                              <p className="text-[10px] text-navy/40 dark:text-slate-500 truncate">{file.project_name} - {new Date(file.last_modified).toLocaleDateString()}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {showFigmaDropdown && figmaFiles.length > 0 && filteredFigmaFiles.length === 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-lg px-3 py-3">
                        <p className="text-xs text-navy/40 dark:text-slate-500 font-body">No matching files. Paste a file key or Figma URL.</p>
                      </div>
                    )}
                  </div>

                  {/* Page Title */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">Page Title</label>
                    <input
                      type="text"
                      value={pageTitle}
                      onChange={e => setPageTitle(e.target.value)}
                      placeholder="e.g. About Us"
                      className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500"
                    />
                  </div>

                  {/* Model Profile */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-2 font-heading">Model Profile</label>
                    <div className="space-y-2">
                      {MODEL_PROFILES.map((profile) => (
                        <label
                          key={profile.id}
                          className={`flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                            modelProfile === profile.id
                              ? 'border-electric ring-2 ring-electric/20 bg-electric/5 dark:bg-electric/10'
                              : 'border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-500'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input type="radio" name="teams_model_profile" value={profile.id} checked={modelProfile === profile.id} onChange={e => setModelProfile(e.target.value)} className="sr-only" />
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${modelProfile === profile.id ? 'border-electric' : 'border-navy/20 dark:border-slate-500'}`}>
                              {modelProfile === profile.id && <div className="w-2 h-2 rounded-full bg-electric" />}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">{profile.label}</p>
                              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">{profile.description}</p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-navy/40 dark:text-slate-500 whitespace-nowrap ml-3 font-heading">{profile.estimatedCost}</span>
                        </label>
                      ))}
                    </div>
                    {modelProfile === 'custom' && (
                      <div className="mt-3 rounded-xl border border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-dark-surface/50 p-4 space-y-3">
                        <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading tracking-wider">Per-Agent Model Selection</p>
                        {AGENT_ROLES.map((role) => (
                          <div key={role.key} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-navy dark:text-slate-200 font-heading">{role.label}</p>
                              <p className="text-[10px] text-navy/40 dark:text-slate-500 truncate font-body">{role.description}</p>
                            </div>
                            <select
                              value={customModels[role.key] || ''}
                              onChange={(e) => setCustomModels(prev => ({ ...prev, [role.key]: e.target.value }))}
                              className="shrink-0 w-44 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-xs text-navy dark:text-slate-100 px-2 py-1.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                            >
                              {AVAILABLE_MODELS.map((model) => (
                                <option key={model.id} value={model.id}>{model.label}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : selectedTemplateId ? (
                /* SEO / generic template fields */
                <>
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">Topic</label>
                    <input
                      type="text"
                      value={newRunTopic}
                      onChange={e => setNewRunTopic(e.target.value)}
                      placeholder="e.g. Best practices for local SEO in 2026"
                      className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">
                      Silo <span className="font-normal text-navy/30 dark:text-slate-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={newRunSilo}
                      onChange={e => setNewRunSilo(e.target.value)}
                      placeholder="e.g. Local SEO"
                      className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500"
                    />
                  </div>
                </>
              ) : null}
            </div>

            {/* Footer - sticky */}
            <div className="sticky bottom-0 bg-white dark:bg-dark-surface px-6 py-4 border-t border-cream-dark dark:border-slate-700 rounded-b-2xl">
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowNewRun(false)}
                  className="px-4 py-2.5 text-sm font-semibold text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors font-heading"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartRun}
                  disabled={starting || !selectedTemplateId || (isPageForge ? (!pageTitle.trim() || !figmaFileKey.trim()) : !newRunTopic.trim())}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-heading"
                >
                  {starting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Starting...
                    </span>
                  ) : (
                    'Start Run'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
