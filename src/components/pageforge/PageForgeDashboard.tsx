'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  PageForgeBuild,
  PageForgeSiteProfile,
  PageForgeBuildStatus,
  PageForgeBuilderType,
} from '@/lib/types';
import { MODEL_PROFILES } from '@/lib/ai/pageforge-pipeline';

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

interface NewBuildForm {
  site_profile_id: string;
  figma_file_key: string;
  page_title: string;
  page_slug: string;
  model_profile: string;
  board_list_id: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PageForgeDashboard() {
  const [activeTab, setActiveTab] = useState<'builds' | 'sites'>('builds');
  const [builds, setBuilds] = useState<PageForgeBuild[]>([]);
  const [sites, setSites] = useState<PageForgeSiteProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewBuildModal, setShowNewBuildModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBuild, setNewBuild] = useState<NewBuildForm>({
    site_profile_id: '',
    figma_file_key: '',
    page_title: '',
    page_slug: '',
    model_profile: 'cost_optimized',
    board_list_id: '',
  });

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
      if (json.data) setBuilds(json.data);
    } catch (err) {
      console.error('Failed to fetch builds:', err);
      setError('Failed to load builds');
    }
  }, []);

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch('/api/pageforge/sites');
      const json = await res.json();
      if (json.data) setSites(json.data);
    } catch (err) {
      console.error('Failed to fetch sites:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    async function load() {
      setLoading(true);
      await Promise.all([fetchBuilds(), fetchSites()]);
      setLoading(false);
    }
    load();
  }, [fetchBuilds, fetchSites]);

  // Auto-refresh builds every 10 seconds
  useEffect(() => {
    const interval = setInterval(fetchBuilds, 10_000);
    return () => clearInterval(interval);
  }, [fetchBuilds]);

  // ------- Create build -------
  const handleCreateBuild = async () => {
    if (!newBuild.site_profile_id || !newBuild.figma_file_key || !newBuild.page_title) return;
    setCreating(true);
    try {
      const res = await fetch('/api/pageforge/builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newBuild,
          boardListId: newBuild.board_list_id || undefined,
        }),
      });
      if (!res.ok) throw new Error('Create failed');
      setShowNewBuildModal(false);
      setNewBuild({ site_profile_id: '', figma_file_key: '', page_title: '', page_slug: '', model_profile: 'cost_optimized', board_list_id: '' });
      await fetchBuilds();
    } catch (err) {
      console.error('Failed to create build:', err);
      setError('Failed to create build');
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">
          PageForge
        </h1>
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
                      className="hover:bg-navy/[0.02] dark:hover:bg-slate-700/30 transition-colors"
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
                        <a
                          href={`/pageforge/builds/${build.id}`}
                          className="text-xs font-semibold text-electric hover:text-electric-bright transition-colors"
                        >
                          View
                        </a>
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
                className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4 space-y-3"
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
                    VQA threshold: {site.vqa_pass_threshold}%
                  </span>
                  <span className="text-[10px] text-navy/30 dark:text-slate-600">
                    LH min: {site.lighthouse_min_score}
                  </span>
                </div>
                <a
                  href={`/pageforge/sites/${site.id}`}
                  className="inline-block text-xs font-semibold text-electric hover:text-electric-bright transition-colors"
                >
                  Edit Profile
                </a>
              </div>
            ))
          )}
        </div>
      )}

      {/* New Build Modal */}
      {showNewBuildModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-modal w-full max-w-lg mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">
                New Build
              </h2>
              <button
                onClick={() => setShowNewBuildModal(false)}
                className="text-navy/30 dark:text-slate-600 hover:text-navy/60 dark:hover:text-slate-300 text-xl leading-none"
              >
                x
              </button>
            </div>

            {/* Site profile selector */}
            <div>
              <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
                Site Profile
              </label>
              <select
                value={newBuild.site_profile_id}
                onChange={(e) =>
                  setNewBuild((prev) => ({ ...prev, site_profile_id: e.target.value }))
                }
                className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
              >
                <option value="">Select a site...</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.site_name} ({site.page_builder})
                  </option>
                ))}
              </select>
            </div>

            {/* Figma URL */}
            <div>
              <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
                Figma File Key / URL
              </label>
              <input
                type="text"
                value={newBuild.figma_file_key}
                onChange={(e) =>
                  setNewBuild((prev) => ({ ...prev, figma_file_key: e.target.value }))
                }
                placeholder="e.g. abcDEF123 or full Figma URL"
                className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
              />
            </div>

            {/* Page title */}
            <div>
              <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
                Page Title
              </label>
              <input
                type="text"
                value={newBuild.page_title}
                onChange={(e) =>
                  setNewBuild((prev) => ({ ...prev, page_title: e.target.value }))
                }
                placeholder="e.g. About Us"
                className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
              />
            </div>

            {/* Page slug */}
            <div>
              <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
                Page Slug (optional)
              </label>
              <input
                type="text"
                value={newBuild.page_slug}
                onChange={(e) =>
                  setNewBuild((prev) => ({ ...prev, page_slug: e.target.value }))
                }
                placeholder="e.g. about-us"
                className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
              />
            </div>

            {/* Model Profile Selector */}
            <div>
              <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-2">
                Model Profile
              </label>
              <div className="space-y-2">
                {MODEL_PROFILES.map((profile) => (
                  <label
                    key={profile.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer transition-all ${
                      newBuild.model_profile === profile.id
                        ? 'border-electric ring-2 ring-electric/20 bg-electric/5 dark:bg-electric/10'
                        : 'border-navy/10 dark:border-slate-600 hover:border-navy/20 dark:hover:border-slate-500'
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
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
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
                        <p className="text-sm font-semibold text-navy dark:text-slate-200">
                          {profile.label}
                        </p>
                        <p className="text-xs text-navy/40 dark:text-slate-500">
                          {profile.description}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-navy/50 dark:text-slate-400 whitespace-nowrap ml-3">
                      {profile.estimatedCost}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Advanced Options */}
            <details className="group">
              <summary className="text-xs font-semibold text-navy/40 dark:text-slate-500 cursor-pointer hover:text-navy/60 dark:hover:text-slate-300">
                Advanced Options
              </summary>
              <div className="mt-3 space-y-3 pl-1">
                <div>
                  <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
                    Board List ID (optional - creates tracking tasks)
                  </label>
                  <input
                    type="text"
                    value={newBuild.board_list_id}
                    onChange={(e) => setNewBuild(prev => ({ ...prev, board_list_id: e.target.value }))}
                    placeholder="Paste a board list UUID to create sub-tasks"
                    className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
                  />
                </div>
              </div>
            </details>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNewBuildModal(false)}
                className="px-4 py-2 text-sm font-semibold text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBuild}
                disabled={creating || !newBuild.site_profile_id || !newBuild.figma_file_key || !newBuild.page_title}
                className="px-5 py-2 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create Build'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
