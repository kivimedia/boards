'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { SeoPipelineRun, SeoTeamConfig } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  planning: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  awaiting_plan_review: 'bg-electric/10 text-electric dark:bg-electric/20 dark:text-blue-300',
  writing: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  humanizing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  scoring: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  awaiting_approval_1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  publishing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  visual_qa: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  awaiting_approval_2: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  published: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  scrapped: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  );
}

export default function SeoDashboard() {
  const [runs, setRuns] = useState<SeoPipelineRun[]>([]);
  const [configs, setConfigs] = useState<SeoTeamConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [showNewRun, setShowNewRun] = useState(false);
  const [newRunTopic, setNewRunTopic] = useState('');
  const [newRunSilo, setNewRunSilo] = useState('');
  const [newRunConfigId, setNewRunConfigId] = useState('');
  const [starting, setStarting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      if (siteFilter !== 'all') params.set('team_config_id', siteFilter);
      const qs = params.toString();

      const [runsRes, configsRes] = await Promise.all([
        fetch(`/api/seo/runs${qs ? `?${qs}` : ''}`),
        fetch('/api/seo/configs'),
      ]);
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        setRuns(runsData.data?.runs || []);
      }
      if (configsRes.ok) {
        const configsData = await configsRes.json();
        setConfigs(configsData.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch SEO data:', err);
    }
    setLoading(false);
  }, [filter, siteFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Supabase Realtime subscription for live updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('seo-dashboard-runs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seo_pipeline_runs' },
        () => { fetchData(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleStartRun = async () => {
    if (!newRunConfigId || !newRunTopic.trim()) return;
    setStarting(true);
    try {
      const res = await fetch('/api/seo/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_config_id: newRunConfigId,
          topic: newRunTopic.trim(),
          silo: newRunSilo.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShowNewRun(false);
        setNewRunTopic('');
        setNewRunSilo('');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to start run:', err);
    }
    setStarting(false);
  };

  const pendingApprovals = runs.filter(r => r.status.startsWith('awaiting_'));
  const activeRuns = runs.filter(r => !['published', 'failed', 'scrapped'].includes(r.status) && !r.status.startsWith('awaiting_'));
  const totalCost = runs.reduce((sum, r) => sum + (r.total_cost_usd || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-navy dark:text-white font-heading">SEO Pipeline</h1>
          <p className="text-xs md:text-sm text-navy/50 dark:text-slate-400 mt-1 font-body">
            Manage automated blog post production
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <Link
            href="/settings/seo"
            className="px-3 md:px-4 py-2 text-xs md:text-sm font-medium text-navy/60 dark:text-slate-400 bg-cream dark:bg-dark-surface rounded-lg hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors font-body"
          >
            Settings
          </Link>
          <button
            onClick={() => setShowNewRun(true)}
            disabled={configs.length === 0}
            className="px-3 md:px-4 py-2 text-xs md:text-sm font-semibold text-white bg-electric rounded-lg hover:bg-electric-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-body"
          >
            + New Run
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Active Runs', value: activeRuns.length, color: 'text-electric' },
          { label: 'Pending Approvals', value: pendingApprovals.length, color: 'text-yellow-600' },
          { label: 'Published', value: runs.filter(r => r.status === 'published').length, color: 'text-green-600' },
          { label: 'Total Cost', value: `$${totalCost.toFixed(2)}`, color: 'text-navy dark:text-white' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 font-heading ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

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
                href={`/seo/${run.id}`}
                className="flex items-center justify-between p-3 bg-white dark:bg-dark-card rounded-lg hover:bg-cream dark:hover:bg-slate-700 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy dark:text-white font-heading truncate">{run.topic || 'Untitled'}</p>
                  <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
                    {run.team_config?.site_name && <span className="mr-2">{run.team_config.site_name}</span>}
                    {run.status === 'awaiting_plan_review' ? 'Plan Review' : run.status === 'awaiting_approval_1' ? 'Gate 1: Content Review' : 'Gate 2: Published Post Review'}
                  </p>
                </div>
                <StatusBadge status={run.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Site Filter */}
        {configs.length > 1 && (
          <select
            value={siteFilter}
            onChange={e => setSiteFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 border border-cream-dark dark:border-slate-700 font-body"
          >
            <option value="all">All Sites</option>
            {configs.map(c => (
              <option key={c.id} value={c.id}>
                {c.site_name}{c.client ? ` (${c.client.name})` : ''}
              </option>
            ))}
          </select>
        )}
        {/* Status Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
          {['all', 'planning', 'writing', 'published', 'failed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors font-body ${
                filter === f
                  ? 'bg-electric text-white'
                  : 'bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-700'
              }`}
            >
              {f === 'all' ? 'All' : f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {/* Runs List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-6 w-6 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-navy/40 dark:text-slate-500 font-body">No pipeline runs yet</p>
          {configs.length === 0 && (
            <p className="text-sm text-navy/30 dark:text-slate-600 mt-2 font-body">
              <Link href="/settings/seo" className="text-electric hover:underline">Configure an SEO team</Link> to get started
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map(run => (
            <Link
              key={run.id}
              href={`/seo/${run.id}`}
              className="flex items-center justify-between p-4 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 hover:border-electric dark:hover:border-electric transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                  <p className="text-sm font-semibold text-navy dark:text-white truncate font-heading">
                    {run.topic || 'Untitled'}
                  </p>
                  <StatusBadge status={run.status} />
                </div>
                <p className="text-xs text-navy/40 dark:text-slate-500 mt-1 font-body">
                  {run.team_config?.site_name && (
                    <span className="mr-3 text-navy/50 dark:text-slate-400">{run.team_config.site_name}</span>
                  )}
                  {run.silo && <span className="mr-3">Silo: {run.silo}</span>}
                  Phase {run.current_phase} - {new Date(run.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right ml-4 shrink-0">
                {run.qc_score != null && (
                  <p className="text-xs text-navy/50 dark:text-slate-400 font-body">QC: {run.qc_score}</p>
                )}
                {run.total_cost_usd > 0 && (
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body">${run.total_cost_usd.toFixed(2)}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New Run Modal */}
      {showNewRun && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNewRun(false)}>
          <div className="bg-white dark:bg-dark-card rounded-xl p-5 md:p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-navy dark:text-white mb-4 font-heading">Start New SEO Run</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Site Config</label>
                <select
                  value={newRunConfigId}
                  onChange={e => setNewRunConfigId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body"
                >
                  <option value="">Select a site...</option>
                  {configs.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.site_name} ({c.site_url}){c.client ? ` - ${c.client.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
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
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowNewRun(false)}
                  className="px-4 py-2 text-sm text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white transition-colors font-body"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartRun}
                  disabled={starting || !newRunConfigId || !newRunTopic.trim()}
                  className="px-4 py-2 text-sm font-semibold text-white bg-electric rounded-lg hover:bg-electric-dark transition-colors disabled:opacity-50 font-body"
                >
                  {starting ? 'Starting...' : 'Start Pipeline'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
