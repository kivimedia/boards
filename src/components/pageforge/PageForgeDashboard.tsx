'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  PageForgeBuild,
  PageForgeSiteProfile,
  PageForgeBuildStatus,
  PageForgeBuilderType,
} from '@/lib/types';
import { MODEL_PROFILES, AVAILABLE_MODELS, AGENT_ROLES } from '@/lib/ai/pageforge-pipeline';

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  published: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  developer_review_gate:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  am_signoff_gate:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const STATUS_DEFAULT_COLOR =
  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';

function statusBadgeClass(status: PageForgeBuildStatus): string {
  return STATUS_COLORS[status] ?? STATUS_DEFAULT_COLOR;
}

function humanStatus(status: PageForgeBuildStatus): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isCredentialStale(createdAt: string): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > 90;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DashboardStats {
  totalBuilds: number;
  activeBuilds: number;
  publishedBuilds: number;
  avgCost: number;
}

const PAGE_BUILDERS = [
  { id: 'gutenberg', label: 'Gutenberg', description: 'WordPress native block editor' },
  { id: 'divi5', label: 'Divi 5', description: 'Elegant Themes Divi 5 builder' },
] as const;

interface NewBuildForm {
  site_profile_id: string;
  figma_file_key: string;
  page_title: string;
  page_builder: string;
  model_profile: string;
  customModels: Record<string, string>;
}

interface ClientEntry {
  id: string;
  name: string;
  company?: string;
}

// Inline site profile creation form
interface NewSiteForm {
  site_name: string;
  site_url: string;
  wp_rest_url: string;
  wp_username: string;
  wp_app_password: string;
  page_builder: string;
  client_id: string;
}

const EMPTY_SITE_FORM: NewSiteForm = {
  site_name: '',
  site_url: '',
  wp_rest_url: '',
  wp_username: '',
  wp_app_password: '',
  page_builder: 'gutenberg',
  client_id: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface FigmaFileEntry {
  key: string;
  name: string;
  thumbnail_url: string | null;
  last_modified: string;
  project_name: string;
}

export default function PageForgeDashboard() {
  const [activeTab, setActiveTab] = useState<'builds' | 'sites'>('builds');
  const [builds, setBuilds] = useState<PageForgeBuild[]>([]);
  const [sites, setSites] = useState<PageForgeSiteProfile[]>([]);
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showNewBuildModal, setShowNewBuildModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const defaultCustomModels = MODEL_PROFILES.find(p => p.id === 'cost_optimized')!.models;
  const [newBuild, setNewBuild] = useState<NewBuildForm>({
    site_profile_id: '',
    figma_file_key: '',
    page_title: '',
    page_builder: '',
    model_profile: 'cost_optimized',
    customModels: { ...defaultCustomModels },
  });

  // Figma files combobox
  const [figmaFiles, setFigmaFiles] = useState<FigmaFileEntry[]>([]);
  const [figmaFilesLoading, setFigmaFilesLoading] = useState(false);
  const [figmaCached, setFigmaCached] = useState(false);
  const [figmaSearch, setFigmaSearch] = useState('');
  const [figmaSelectedName, setFigmaSelectedName] = useState('');
  const [showFigmaDropdown, setShowFigmaDropdown] = useState(false);
  const figmaDropdownRef = useRef<HTMLDivElement>(null);

  // Board tracking toggle
  const [trackOnBoard, setTrackOnBoard] = useState(false);

  // Inline new site profile
  const [showNewSiteForm, setShowNewSiteForm] = useState(false);
  const [newSiteForm, setNewSiteForm] = useState<NewSiteForm>({ ...EMPTY_SITE_FORM });
  const [creatingSite, setCreatingSite] = useState(false);
  const [retryingBuildId, setRetryingBuildId] = useState<string | null>(null);

  // Close Figma dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (figmaDropdownRef.current && !figmaDropdownRef.current.contains(e.target as Node)) {
        setShowFigmaDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch Figma files when site profile changes
  const loadFigmaFiles = useCallback(async (siteProfileId: string, bust = false) => {
    setFigmaFilesLoading(true);
    setFigmaCached(false);
    try {
      const qs = bust ? `&bust=1` : '';
      const res = await fetch(`/api/pageforge/figma/files?siteProfileId=${siteProfileId}${qs}`);
      const json = await res.json();
      if (json.files) {
        setFigmaFiles(json.files);
        setFigmaCached(!!json.cached);
      }
    } catch {
      // silent - user can still type manually
    } finally {
      setFigmaFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!newBuild.site_profile_id) {
      setFigmaFiles([]);
      return;
    }
    loadFigmaFiles(newBuild.site_profile_id);
  }, [newBuild.site_profile_id, loadFigmaFiles]);

  const filteredFigmaFiles = figmaSearch
    ? figmaFiles.filter(f =>
        f.name.toLowerCase().includes(figmaSearch.toLowerCase()) ||
        f.project_name.toLowerCase().includes(figmaSearch.toLowerCase())
      )
    : figmaFiles;

  // Derived stats
  const stats: DashboardStats = {
    totalBuilds: builds.length,
    activeBuilds: builds.filter(
      (b) =>
        b.status !== 'published' &&
        b.status !== 'failed' &&
        b.status !== 'cancelled',
    ).length,
    publishedBuilds: builds.filter((b) => b.status === 'published').length,
    avgCost:
      builds.length > 0
        ? builds.reduce((sum, b) => sum + (b.total_cost_usd ?? 0), 0) /
          builds.length
        : 0,
  };

  // ------- Fetchers -------
  const fetchBuilds = useCallback(async () => {
    try {
      const res = await fetch('/api/pageforge/builds');
      const json = await res.json();
      if (json.builds) setBuilds(json.builds);
    } catch (err) {
      console.error('Failed to fetch builds:', err);
      setError('Failed to load builds');
    }
  }, []);

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch('/api/pageforge/sites');
      const json = await res.json();
      if (json.sites) setSites(json.sites);
    } catch (err) {
      console.error('Failed to fetch sites:', err);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients');
      const json = await res.json();
      if (json.data) setClients(json.data);
      else if (Array.isArray(json)) setClients(json);
    } catch {
      // silent
    }
  }, []);

  const handleRetryBuild = async (buildId: string, currentPhase: number) => {
    setRetryingBuildId(buildId);
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_from_phase: currentPhase }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Retry failed');
      }
      await fetchBuilds();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry build');
    } finally {
      setRetryingBuildId(null);
    }
  };

  // Initial load
  useEffect(() => {
    async function load() {
      setLoading(true);
      await Promise.all([fetchBuilds(), fetchSites(), fetchClients()]);
      setLoading(false);
    }
    load();
  }, [fetchBuilds, fetchSites, fetchClients]);

  // Auto-refresh builds every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchBuilds, 10_000);
    return () => clearInterval(interval);
  }, [fetchBuilds]);

  // ------- Create site profile (inline) -------
  const handleCreateSite = async () => {
    if (!newSiteForm.site_name || !newSiteForm.site_url) return;
    // Ensure REST URL is set (auto-derived from site_url)
    const restUrl = newSiteForm.wp_rest_url || `${newSiteForm.site_url.replace(/\/+$/, '')}/wp-json`;
    setCreatingSite(true);
    try {
      const res = await fetch('/api/pageforge/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteName: newSiteForm.site_name,
          siteUrl: newSiteForm.site_url,
          wpRestUrl: restUrl,
          wpUsername: newSiteForm.wp_username || undefined,
          wpAppPassword: newSiteForm.wp_app_password || undefined,
          pageBuilder: newSiteForm.page_builder,
          clientId: newSiteForm.client_id || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || errBody?.message || `Create failed (${res.status})`);
      }
      const json = await res.json();
      // Add new site to list and select it
      if (json.site) {
        setSites(prev => [json.site, ...prev]);
        setNewBuild(prev => ({
          ...prev,
          site_profile_id: json.site.id,
          page_builder: json.site.page_builder || prev.page_builder,
        }));
      }
      setShowNewSiteForm(false);
      setNewSiteForm({ ...EMPTY_SITE_FORM });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create site profile');
    } finally {
      setCreatingSite(false);
    }
  };

  // ------- Create build -------
  const handleCreateBuild = async () => {
    if (!newBuild.site_profile_id || !newBuild.figma_file_key || !newBuild.page_title) return;
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        siteProfileId: newBuild.site_profile_id,
        figmaFileKey: newBuild.figma_file_key,
        pageTitle: newBuild.page_title,
        page_builder: newBuild.page_builder || undefined,
        model_profile: newBuild.model_profile,
        trackOnBoard: trackOnBoard || undefined,
      };
      if (newBuild.model_profile === 'custom') {
        payload.custom_models = newBuild.customModels;
      }
      const res = await fetch('/api/pageforge/builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || errBody?.message || `Create failed (${res.status})`);
      }
      setShowNewBuildModal(false);
      setNewBuild({ site_profile_id: '', figma_file_key: '', page_title: '', page_builder: '', model_profile: 'cost_optimized', customModels: { ...defaultCustomModels } });
      setFigmaSearch('');
      setFigmaSelectedName('');
      setShowFigmaDropdown(false);
      setTrackOnBoard(false);
      await fetchBuilds();
    } catch (err) {
      console.error('Failed to create build:', err);
      setError(err instanceof Error ? err.message : 'Failed to create build');
    } finally {
      setCreating(false);
    }
  };

  // ------- Render helpers -------
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ------- Loading -------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={async () => {
            try {
              const { createClient } = await import('@/lib/supabase/client');
              const supabase = createClient();
              const { data } = await supabase.auth.getSession();
              if (data?.session?.access_token) {
                await navigator.clipboard.writeText(data.session.access_token);
                setError(null);
                setCopiedToken(true);
                setTimeout(() => setCopiedToken(false), 3000);
              } else {
                setError('No active session found. Try refreshing the page.');
              }
            } catch {
              setError('Failed to copy token');
            }
          }}
          className="px-3 py-2 text-xs font-medium text-navy/60 dark:text-slate-400 bg-cream dark:bg-slate-800 hover:bg-cream-dark dark:hover:bg-slate-700 border border-cream-dark dark:border-slate-600 rounded-lg transition-colors"
          title="Copy your auth token for the Figma plugin"
        >
          {copiedToken ? 'Copied!' : 'Copy Plugin Token'}
        </button>
        <button
          onClick={() => setShowNewBuildModal(true)}
          className="px-4 py-2 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors"
        >
          + New Build
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 dark:hover:text-red-200 text-lg leading-none"
          >
            x
          </button>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Builds', value: stats.totalBuilds.toString(), color: 'text-navy dark:text-slate-100' },
          { label: 'Active', value: stats.activeBuilds.toString(), color: 'text-electric' },
          { label: 'Published', value: stats.publishedBuilds.toString(), color: 'text-success' },
          { label: 'Avg Cost', value: `$${stats.avgCost.toFixed(2)}`, color: 'text-warning' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4"
          >
            <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
              {stat.label}
            </span>
            <p className={`text-2xl font-bold font-heading mt-1 ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-navy/10 dark:border-slate-700">
        {(['builds', 'sites'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-electric text-electric'
                : 'border-transparent text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'builds' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 overflow-hidden">
          {builds.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-navy/40 dark:text-slate-500">No builds yet</p>
              <p className="text-xs text-navy/30 dark:text-slate-600 mt-1">
                Create your first build to get started
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-navy/5 dark:border-slate-700">
                    {['Title', 'Status', 'VQA Score', 'Cost', 'Created', 'Actions'].map(
                      (header) => (
                        <th
                          key={header}
                          className="px-4 py-3 text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase"
                        >
                          {header}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy/5 dark:divide-slate-700">
                  {builds.map((build) => (
                    <tr
                      key={build.id}
                      onClick={() => window.location.href = `/pageforge/${build.id}`}
                      className="hover:bg-navy/[0.02] dark:hover:bg-slate-700/30 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-navy dark:text-slate-200 truncate max-w-[200px]">
                          {build.page_title}
                        </p>
                        {build.site_profile?.site_name && (
                          <p className="text-xs text-navy/40 dark:text-slate-500 mt-0.5">
                            {build.site_profile.site_name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusBadgeClass(build.status)}`}
                        >
                          {humanStatus(build.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {build.vqa_score_overall != null ? (
                          <span
                            className={`text-sm font-bold ${
                              build.vqa_score_overall >= 90
                                ? 'text-success'
                                : build.vqa_score_overall >= 70
                                  ? 'text-warning'
                                  : 'text-danger'
                            }`}
                          >
                            {build.vqa_score_overall}%
                          </span>
                        ) : (
                          <span className="text-xs text-navy/30 dark:text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-navy/60 dark:text-slate-400">
                        ${build.total_cost_usd.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-xs text-navy/40 dark:text-slate-500">
                        {formatDate(build.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <a
                            href={`/pageforge/${build.id}`}
                            className="text-xs font-semibold text-electric hover:text-electric-bright transition-colors"
                          >
                            View
                          </a>
                          {(build.status === 'failed' || build.status === 'cancelled') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRetryBuild(build.id, build.current_phase ?? 0);
                              }}
                              disabled={retryingBuildId === build.id}
                              className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              {retryingBuildId === build.id ? 'Retrying...' : 'Retry'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sites' && (
        <div className="space-y-4">
          {/* Manage Sites link */}
          <div className="flex items-center justify-end">
            <a
              href="/pageforge/sites"
              className="px-4 py-2 text-xs font-semibold text-electric border border-electric rounded-lg hover:bg-electric/5 dark:hover:bg-electric/10 transition-colors font-heading"
            >
              Manage Sites
            </a>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sites.length === 0 ? (
              <div className="col-span-full text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700">
                <p className="text-sm text-navy/40 dark:text-slate-500">No site profiles</p>
                <p className="text-xs text-navy/30 dark:text-slate-600 mt-1">
                  Create a site profile to connect WordPress
                </p>
              </div>
            ) : (
              sites.map((site) => (
                <div
                  key={site.id}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4 space-y-3 hover:border-navy/20 dark:hover:border-slate-500 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-navy dark:text-slate-200 truncate">
                      {site.site_name}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      {isCredentialStale(site.created_at) && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
                          Rotate Creds
                        </span>
                      )}
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-navy/5 dark:bg-slate-700 text-navy/40 dark:text-slate-500">
                        {site.page_builder}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-navy/40 dark:text-slate-500 truncate">
                    {site.site_url}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-navy/30 dark:text-slate-600">
                      VQA {site.vqa_pass_threshold}%
                    </span>
                    <span className="text-[10px] text-navy/30 dark:text-slate-600">
                      LH {site.lighthouse_min_score}
                    </span>
                    {site.figma_personal_token && <span className="text-[10px] text-electric">Figma</span>}
                    {site.wp_username && <span className="text-[10px] text-green-600 dark:text-green-400">WP API</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* New Build Modal */}
      {showNewBuildModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[2vh] sm:pt-[5vh] md:pt-[10vh] px-2 sm:px-4">
          <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm dark:bg-black/70" onClick={() => { setShowNewBuildModal(false); setShowNewSiteForm(false); }} />
          <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-modal w-full max-w-lg max-h-[92vh] sm:max-h-[88vh] md:max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-dark-surface px-6 pt-5 pb-4 border-b border-cream-dark dark:border-slate-700 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">
                    {showNewSiteForm ? 'New Site Profile' : 'New Build'}
                  </h2>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
                    {showNewSiteForm ? 'Connect a WordPress site' : 'Create a Figma-to-WordPress page build'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (showNewSiteForm) {
                      setShowNewSiteForm(false);
                    } else {
                      setShowNewBuildModal(false);
                    }
                  }}
                  className="text-navy/30 dark:text-slate-600 hover:text-navy/60 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {/* --- NEW SITE PROFILE FORM --- */}
            {showNewSiteForm ? (
              <>
                <div className="px-6 py-5 space-y-4">
                  {/* Site Name */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">
                      Site Name
                    </label>
                    <input
                      type="text"
                      value={newSiteForm.site_name}
                      onChange={(e) => setNewSiteForm(prev => ({ ...prev, site_name: e.target.value }))}
                      placeholder="e.g. Kivi Media Staging"
                      className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500"
                    />
                  </div>

                  {/* Site URL - auto-derives WP REST URL */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">
                      Site URL
                    </label>
                    <input
                      type="text"
                      value={newSiteForm.site_url}
                      onChange={(e) => {
                        const url = e.target.value;
                        const base = url.replace(/\/+$/, '');
                        setNewSiteForm(prev => ({
                          ...prev,
                          site_url: url,
                          wp_rest_url: base ? `${base}/wp-json` : '',
                        }));
                      }}
                      placeholder="https://example.com"
                      className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500"
                    />
                    {newSiteForm.wp_rest_url && (
                      <p className="text-[10px] text-navy/40 dark:text-slate-500 mt-1 font-body">
                        REST API: {newSiteForm.wp_rest_url}
                      </p>
                    )}
                  </div>

                  {/* WordPress API Access */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 font-heading">
                      WordPress API Access
                    </label>
                    <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body -mt-1">
                      PageForge uses Application Passwords to create and edit pages via the WP REST API.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <input
                          type="text"
                          value={newSiteForm.wp_username}
                          onChange={(e) => setNewSiteForm(prev => ({ ...prev, wp_username: e.target.value }))}
                          placeholder="WordPress username"
                          className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500"
                        />
                      </div>
                      <div>
                        <input
                          type="password"
                          value={newSiteForm.wp_app_password}
                          onChange={(e) => setNewSiteForm(prev => ({ ...prev, wp_app_password: e.target.value }))}
                          placeholder="xxxx xxxx xxxx xxxx"
                          className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-navy/30 dark:text-slate-600 font-body">
                      Generate at{' '}
                      <a href="https://wordpress.org/documentation/article/application-passwords/" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">
                        WP Admin &gt; Users &gt; Profile &gt; Application Passwords
                      </a>
                    </p>
                  </div>

                  {/* Page Builder */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-2 font-heading">
                      Page Builder
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {PAGE_BUILDERS.map((builder) => (
                        <label
                          key={builder.id}
                          className={`flex flex-col items-center rounded-xl border px-3 py-2.5 cursor-pointer transition-all text-center ${
                            newSiteForm.page_builder === builder.id
                              ? 'border-electric ring-2 ring-electric/20 bg-electric/5 dark:bg-electric/10'
                              : 'border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-500'
                          }`}
                        >
                          <input
                            type="radio"
                            name="new_site_page_builder"
                            value={builder.id}
                            checked={newSiteForm.page_builder === builder.id}
                            onChange={(e) => setNewSiteForm(prev => ({ ...prev, page_builder: e.target.value }))}
                            className="sr-only"
                          />
                          <p className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">{builder.label}</p>
                          <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body">{builder.description}</p>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Client selector */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">
                      Client <span className="font-normal text-navy/30 dark:text-slate-600">(optional)</span>
                    </label>
                    <select
                      value={newSiteForm.client_id}
                      onChange={(e) => setNewSiteForm(prev => ({ ...prev, client_id: e.target.value }))}
                      className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                    >
                      <option value="">No client</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white dark:bg-dark-surface px-6 py-4 border-t border-cream-dark dark:border-slate-700 rounded-b-2xl">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => setShowNewSiteForm(false)}
                      className="px-4 py-2.5 text-sm font-semibold text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors font-heading"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleCreateSite}
                      disabled={creatingSite || !newSiteForm.site_name || !newSiteForm.site_url}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-heading"
                    >
                      {creatingSite ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Creating...
                        </span>
                      ) : (
                        'Create Site Profile'
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* --- NEW BUILD FORM --- */
              <>
                <div className="px-6 py-5 space-y-5">
                  {/* Site profile selector */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">
                      Site Profile
                    </label>
                    {sites.length === 0 ? (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
                        <p className="text-xs text-amber-700 dark:text-amber-300 font-body">
                          No site profiles yet.{' '}
                          <button
                            onClick={() => setShowNewSiteForm(true)}
                            className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-100"
                          >
                            Create one now
                          </button>
                        </p>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={newBuild.site_profile_id}
                          onChange={(e) => {
                            const siteId = e.target.value;
                            const selectedSite = sites.find(s => s.id === siteId);
                            setNewBuild((prev) => ({
                              ...prev,
                              site_profile_id: siteId,
                              page_builder: selectedSite?.page_builder || prev.page_builder,
                            }));
                            // Reset figma state when switching sites
                            setFigmaSearch('');
                            setFigmaSelectedName('');
                            setNewBuild(prev => ({ ...prev, site_profile_id: siteId, figma_file_key: '', page_builder: selectedSite?.page_builder || prev.page_builder }));
                          }}
                          className="flex-1 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                        >
                          <option value="">Select a site...</option>
                          {sites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.site_name} ({site.page_builder})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setShowNewSiteForm(true)}
                          className="shrink-0 px-3 py-2.5 rounded-lg border border-cream-dark dark:border-slate-700 text-sm text-navy/60 dark:text-slate-400 hover:text-electric hover:border-electric dark:hover:text-electric transition-colors font-heading"
                          title="Create new site profile"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                      </div>
                    )}
                    {/* Show selected site's client info */}
                    {newBuild.site_profile_id && (() => {
                      const selectedSite = sites.find(s => s.id === newBuild.site_profile_id);
                      const clientName = (selectedSite as any)?.client?.name;
                      return clientName ? (
                        <p className="text-[10px] text-navy/40 dark:text-slate-500 mt-1 font-body">
                          Client: {clientName}
                        </p>
                      ) : null;
                    })()}
                  </div>

                  {/* Figma File - Combobox */}
                  <div className="relative" ref={figmaDropdownRef}>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">
                      Figma File
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={figmaSearch || figmaSelectedName || newBuild.figma_file_key}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFigmaSearch(val);
                          setFigmaSelectedName('');
                          // If it looks like a file key or Figma URL, extract and set the key
                          const figmaUrlMatch = val.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/);
                          if (figmaUrlMatch) {
                            setNewBuild((prev) => ({ ...prev, figma_file_key: figmaUrlMatch[1] }));
                          } else {
                            setNewBuild((prev) => ({ ...prev, figma_file_key: val }));
                          }
                          setShowFigmaDropdown(true);
                        }}
                        onFocus={() => { if (figmaFiles.length > 0) setShowFigmaDropdown(true); }}
                        placeholder={
                          !newBuild.site_profile_id
                            ? 'Select a site first'
                            : figmaFilesLoading
                              ? 'Loading Figma files...'
                              : figmaFiles.length > 0
                                ? 'Search or pick a Figma file...'
                                : 'Paste file key or Figma URL'
                        }
                        disabled={!newBuild.site_profile_id}
                        className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 pr-8 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      {figmaFilesLoading && (
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse" />
                          <div className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse [animation-delay:150ms]" />
                          <div className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse [animation-delay:300ms]" />
                        </div>
                      )}
                      {!figmaFilesLoading && figmaFiles.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowFigmaDropdown(!showFigmaDropdown)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-navy/30 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                      )}
                      {/* Clear selection button */}
                      {figmaSelectedName && (
                        <button
                          type="button"
                          onClick={() => {
                            setFigmaSearch('');
                            setFigmaSelectedName('');
                            setNewBuild(prev => ({ ...prev, figma_file_key: '' }));
                          }}
                          className="absolute right-8 top-1/2 -translate-y-1/2 text-navy/30 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                    {/* Figma file count indicator + refresh */}
                    {!figmaFilesLoading && figmaFiles.length > 0 && !showFigmaDropdown && (
                      <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1 font-body flex items-center gap-1.5">
                        <span>{figmaFiles.length} files available{figmaCached ? ' (cached)' : ''}</span>
                        <button
                          type="button"
                          onClick={() => loadFigmaFiles(newBuild.site_profile_id, true)}
                          className="text-electric hover:text-electric-bright transition-colors"
                          title="Refresh from Figma"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                        </button>
                      </p>
                    )}
                    {/* First load hint */}
                    {figmaFilesLoading && figmaFiles.length === 0 && (
                      <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1 font-body">
                        First load may take ~20s for large teams
                      </p>
                    )}
                    {/* Dropdown */}
                    {showFigmaDropdown && filteredFigmaFiles.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-lg">
                        {filteredFigmaFiles.slice(0, 50).map((file) => (
                          <button
                            key={file.key}
                            type="button"
                            onClick={() => {
                              setNewBuild((prev) => ({ ...prev, figma_file_key: file.key }));
                              setFigmaSelectedName(file.name);
                              setFigmaSearch('');
                              setShowFigmaDropdown(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-cream dark:hover:bg-slate-800 transition-colors border-b border-cream-dark/30 dark:border-slate-700/30 last:border-b-0"
                          >
                            {file.thumbnail_url ? (
                              <img
                                src={file.thumbnail_url}
                                alt=""
                                className="w-10 h-10 rounded-lg object-cover shrink-0 bg-cream dark:bg-slate-800"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-cream dark:bg-slate-800 flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 dark:text-slate-600"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                                {file.name}
                              </p>
                              <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body truncate">
                                {file.project_name} - {new Date(file.last_modified).toLocaleDateString()}
                              </p>
                            </div>
                          </button>
                        ))}
                        {filteredFigmaFiles.length > 50 && (
                          <p className="px-3 py-2 text-[10px] text-navy/30 dark:text-slate-600 text-center font-body">
                            Showing 50 of {filteredFigmaFiles.length} results. Type to narrow down.
                          </p>
                        )}
                      </div>
                    )}
                    {showFigmaDropdown && figmaFiles.length > 0 && filteredFigmaFiles.length === 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-lg px-3 py-3">
                        <p className="text-xs text-navy/40 dark:text-slate-500 font-body">No matching files. You can paste a file key or Figma URL directly.</p>
                      </div>
                    )}
                  </div>

                  {/* Page Builder */}
                  {newBuild.site_profile_id && (
                    <div>
                      <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-2 font-heading">
                        Page Builder
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {PAGE_BUILDERS.map((builder) => (
                          <label
                            key={builder.id}
                            className={`flex flex-col items-center rounded-xl border px-3 py-3 cursor-pointer transition-all text-center ${
                              newBuild.page_builder === builder.id
                                ? 'border-electric ring-2 ring-electric/20 bg-electric/5 dark:bg-electric/10'
                                : 'border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-500 hover:bg-cream/30 dark:hover:bg-slate-800/30'
                            }`}
                          >
                            <input
                              type="radio"
                              name="page_builder"
                              value={builder.id}
                              checked={newBuild.page_builder === builder.id}
                              onChange={(e) => setNewBuild((prev) => ({ ...prev, page_builder: e.target.value }))}
                              className="sr-only"
                            />
                            <p className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
                              {builder.label}
                            </p>
                            <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body mt-0.5">
                              {builder.description}
                            </p>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Page title */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">
                      Page Title
                    </label>
                    <input
                      type="text"
                      value={newBuild.page_title}
                      onChange={(e) =>
                        setNewBuild((prev) => ({ ...prev, page_title: e.target.value }))
                      }
                      placeholder="e.g. About Us"
                      className="w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500"
                    />
                  </div>

                  {/* Model Profile Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-2 font-heading">
                      Model Profile
                    </label>
                    <div className="space-y-2">
                      {MODEL_PROFILES.map((profile) => (
                        <label
                          key={profile.id}
                          className={`flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                            newBuild.model_profile === profile.id
                              ? 'border-electric ring-2 ring-electric/20 bg-electric/5 dark:bg-electric/10'
                              : 'border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-500 hover:bg-cream/30 dark:hover:bg-slate-800/30'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="model_profile"
                              value={profile.id}
                              checked={newBuild.model_profile === profile.id}
                              onChange={(e) =>
                                setNewBuild((prev) => ({ ...prev, model_profile: e.target.value }))
                              }
                              className="sr-only"
                            />
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                newBuild.model_profile === profile.id
                                  ? 'border-electric'
                                  : 'border-navy/20 dark:border-slate-500'
                              }`}
                            >
                              {newBuild.model_profile === profile.id && (
                                <div className="w-2 h-2 rounded-full bg-electric" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
                                {profile.label}
                              </p>
                              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                                {profile.description}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-navy/40 dark:text-slate-500 whitespace-nowrap ml-3 font-heading">
                            {profile.estimatedCost}
                          </span>
                        </label>
                      ))}
                    </div>
                    {/* Custom per-agent model picker */}
                    {newBuild.model_profile === 'custom' && (
                      <div className="mt-3 rounded-xl border border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-dark-surface/50 p-4 space-y-3">
                        <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading tracking-wider">
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
                              value={newBuild.customModels[role.key] || ''}
                              onChange={(e) =>
                                setNewBuild((prev) => ({
                                  ...prev,
                                  customModels: { ...prev.customModels, [role.key]: e.target.value },
                                }))
                              }
                              className="shrink-0 w-44 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-xs text-navy dark:text-slate-100 px-2 py-1.5 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
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

                  {/* Track on client's board */}
                  {newBuild.site_profile_id && (() => {
                    const selectedSite = sites.find(s => s.id === newBuild.site_profile_id);
                    const hasClient = !!selectedSite?.client_id;
                    const clientName = (selectedSite as any)?.client?.name;
                    return (
                      <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                        !hasClient ? 'border-cream-dark/50 dark:border-slate-700/50 opacity-50' : 'border-cream-dark dark:border-slate-700'
                      }`}>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
                            Track on client&apos;s board
                          </p>
                          <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body mt-0.5">
                            {!hasClient
                              ? 'No client linked to this site profile'
                              : trackOnBoard
                                ? `Build progress posted to ${clientName || 'client'}'s board`
                                : 'Creates tracking tasks on the client board'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={trackOnBoard}
                          disabled={!hasClient}
                          onClick={() => setTrackOnBoard(prev => !prev)}
                          className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${
                            trackOnBoard ? 'bg-electric' : 'bg-navy/15 dark:bg-slate-600'
                          } disabled:cursor-not-allowed`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                              trackOnBoard ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Footer actions - sticky */}
                <div className="sticky bottom-0 bg-white dark:bg-dark-surface px-6 py-4 border-t border-cream-dark dark:border-slate-700 rounded-b-2xl">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => setShowNewBuildModal(false)}
                      className="px-4 py-2.5 text-sm font-semibold text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors font-heading"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateBuild}
                      disabled={creating || !newBuild.site_profile_id || !newBuild.figma_file_key || !newBuild.page_title}
                      className="px-5 py-2.5 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-heading"
                    >
                      {creating ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Creating...
                        </span>
                      ) : (
                        'Create Build'
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
