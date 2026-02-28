'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

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
  input_data: Record<string, unknown>;
  created_at: string;
  template: { id: string; slug: string; name: string; icon: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  scrapped: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
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
  const [loading, setLoading] = useState(true);
  const [showNewRun, setShowNewRun] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [inputDataText, setInputDataText] = useState('{\n  "topic": "",\n  "silo": ""\n}');
  const [starting, setStarting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [templatesRes, runsRes] = await Promise.all([
        fetch('/api/teams'),
        fetch('/api/teams/runs'),
      ]);

      if (templatesRes.ok) {
        const json = await templatesRes.json();
        setTemplates(json.data || []);
      }
      if (runsRes.ok) {
        const json = await runsRes.json();
        setRuns(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch teams data:', err);
    }
    setLoading(false);
  }, []);

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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleStartRun = async () => {
    if (!selectedTemplateId) return;
    setStarting(true);

    try {
      let inputData: Record<string, unknown>;
      try {
        inputData = JSON.parse(inputDataText);
      } catch {
        alert('Invalid JSON in input data');
        setStarting(false);
        return;
      }

      const res = await fetch('/api/teams/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplateId,
          input_data: inputData,
        }),
      });

      if (res.ok) {
        setShowNewRun(false);
        setInputDataText('{\n  "topic": "",\n  "silo": ""\n}');
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
                href={`/teams/runs/${run.id}`}
                className="flex items-center justify-between p-3 bg-white dark:bg-dark-card rounded-lg hover:bg-cream dark:hover:bg-slate-700 transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-navy dark:text-white font-heading">
                    {run.template?.name || 'Unknown Template'}
                  </p>
                  <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
                    {JSON.stringify(run.input_data).slice(0, 80)}
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
                      <span className="text-navy/20 dark:text-slate-600 text-[10px] hidden sm:inline">→</span>
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
                href={`/teams/runs/${run.id}`}
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
                    {new Date(run.created_at).toLocaleDateString()} - Phase {run.current_phase + 1}
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
                <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Input Data (JSON)</label>
                <textarea
                  value={inputDataText}
                  onChange={e => setInputDataText(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-mono font-body"
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
                  disabled={starting || !selectedTemplateId}
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
