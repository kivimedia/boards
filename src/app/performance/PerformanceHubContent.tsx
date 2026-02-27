'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { PKTrackerSummary, PKAMScorecard, PKSyncRun, PK_TRACKER_LABELS } from '@/lib/types';

interface DashboardData {
  trackers: PKTrackerSummary[];
  last_sync_run: PKSyncRun | null;
  am_scorecard: Array<{
    account_manager_name: string;
    fathom_videos_watched: number;
    fathom_videos_total: number;
    client_updates_on_time: number;
    client_updates_total: number;
    sanity_checks_done: number;
    sanity_checks_total: number;
  }>;
  flagged_tickets_count: number;
}

interface PerformanceHubContentProps {
  isAdmin: boolean;
  canSync?: boolean;
}

export default function PerformanceHubContent({ isAdmin, canSync }: PerformanceHubContentProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'scorecard' | 'trackers'>('overview');

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/performance/dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const triggerSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/performance/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        // Refresh dashboard after sync
        await fetchDashboard();
      }
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Skeleton header */}
          <div className="animate-pulse h-10 w-64 rounded-xl bg-cream-dark/40 dark:bg-white/10" />
          {/* Skeleton cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse h-28 rounded-2xl bg-cream-dark/40 dark:bg-white/10" />
            ))}
          </div>
          <div className="animate-pulse h-64 rounded-2xl bg-cream-dark/40 dark:bg-white/10" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-navy/50 dark:text-white/50">Failed to load performance data.</p>
          <button
            onClick={() => { setLoading(true); fetchDashboard(); }}
            className="px-4 py-2 rounded-lg bg-electric text-white text-sm font-medium hover:bg-electric/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'scorecard' as const, label: 'AM Scorecard' },
    { id: 'trackers' as const, label: 'All Trackers' },
  ];

  // Stats for overview cards
  const totalTrackers = data.trackers.length;
  const freshCount = data.trackers.filter(t => t.freshness === 'fresh').length;
  const staleCount = data.trackers.filter(t => t.freshness === 'stale').length;
  const overdueCount = data.trackers.filter(t => t.freshness === 'overdue').length;
  const totalRows = data.trackers.reduce((sum, t) => sum + t.total_rows, 0);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with sync button */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-navy dark:text-white">
              Performance Keeping
            </h2>
            {data.last_sync_run && (
              <p className="text-xs text-navy/50 dark:text-white/40 mt-1">
                Last sync: {formatRelativeTime(data.last_sync_run.started_at)}
                {data.last_sync_run.status === 'error' && (
                  <span className="ml-2 text-red-500">
                    (sync had errors)
                  </span>
                )}
              </p>
            )}
          </div>
          {(canSync || isAdmin) && (
            <button
              onClick={triggerSync}
              disabled={syncing}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${syncing
                  ? 'bg-navy/10 dark:bg-white/10 text-navy/40 dark:text-white/40 cursor-not-allowed'
                  : 'bg-electric text-white hover:bg-electric/90 shadow-sm'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={syncing ? 'animate-spin' : ''}>
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-cream-dark/40 dark:bg-white/5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${activeTab === tab.id
                  ? 'bg-white dark:bg-white/10 text-navy dark:text-white shadow-sm'
                  : 'text-navy/50 dark:text-white/40 hover:text-navy/70 dark:hover:text-white/60'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === 'overview' && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Total Trackers"
                value={totalTrackers}
                sublabel={`${totalRows.toLocaleString()} total rows`}
                color="blue"
              />
              <SummaryCard
                label="Fresh"
                value={freshCount}
                sublabel="Up to date"
                color="green"
              />
              <SummaryCard
                label="Stale"
                value={staleCount}
                sublabel="Needs attention"
                color="yellow"
              />
              <SummaryCard
                label="Flagged Tickets"
                value={data.flagged_tickets_count}
                sublabel={overdueCount > 0 ? `${overdueCount} overdue trackers` : 'No overdue trackers'}
                color="red"
              />
            </div>

            {/* Top AM Scorecard preview */}
            {data.am_scorecard.length > 0 && (
              <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-navy dark:text-white">
                    AM Scorecard (Top Performers)
                  </h3>
                  <button
                    onClick={() => setActiveTab('scorecard')}
                    className="text-xs text-electric hover:text-electric/80 font-medium"
                  >
                    View All
                  </button>
                </div>
                <div className="space-y-3">
                  {data.am_scorecard.slice(0, 5).map(am => (
                    <AMScorecardRow key={am.account_manager_name} am={am} />
                  ))}
                </div>
              </div>
            )}

            {/* Recent tracker status */}
            <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-navy dark:text-white">
                  Tracker Status
                </h3>
                <button
                  onClick={() => setActiveTab('trackers')}
                  className="text-xs text-electric hover:text-electric/80 font-medium"
                >
                  View All
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.trackers.slice(0, 6).map(tracker => (
                  <TrackerCard key={tracker.tracker_type} tracker={tracker} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* AM Scorecard tab */}
        {activeTab === 'scorecard' && (
          <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 p-5">
            <h3 className="text-sm font-semibold text-navy dark:text-white mb-4">
              Account Manager Scorecard
            </h3>
            {data.am_scorecard.length === 0 ? (
              <p className="text-sm text-navy/50 dark:text-white/40 py-8 text-center">
                No scorecard data available yet. Run a sync first.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-dark/60 dark:border-white/10">
                      <th className="text-left py-2 px-3 font-medium text-navy/60 dark:text-white/50">Account Manager</th>
                      <th className="text-center py-2 px-3 font-medium text-navy/60 dark:text-white/50">Fathom Videos</th>
                      <th className="text-center py-2 px-3 font-medium text-navy/60 dark:text-white/50">Client Updates</th>
                      <th className="text-center py-2 px-3 font-medium text-navy/60 dark:text-white/50">Sanity Checks</th>
                      <th className="text-center py-2 px-3 font-medium text-navy/60 dark:text-white/50">Overall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.am_scorecard.map(am => {
                      const fathomPct = am.fathom_videos_total > 0 ? Math.round((am.fathom_videos_watched / am.fathom_videos_total) * 100) : null;
                      const updatesPct = am.client_updates_total > 0 ? Math.round((am.client_updates_on_time / am.client_updates_total) * 100) : null;
                      const sanityPct = am.sanity_checks_total > 0 ? Math.round((am.sanity_checks_done / am.sanity_checks_total) * 100) : null;
                      const scores = [fathomPct, updatesPct, sanityPct].filter(s => s !== null) as number[];
                      const overallPct = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

                      return (
                        <tr key={am.account_manager_name} className="border-b border-cream-dark/30 dark:border-white/5 last:border-0">
                          <td className="py-3 px-3 font-medium text-navy dark:text-white">
                            {am.account_manager_name}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <ScoreBadge watched={am.fathom_videos_watched} total={am.fathom_videos_total} />
                          </td>
                          <td className="py-3 px-3 text-center">
                            <ScoreBadge watched={am.client_updates_on_time} total={am.client_updates_total} />
                          </td>
                          <td className="py-3 px-3 text-center">
                            <ScoreBadge watched={am.sanity_checks_done} total={am.sanity_checks_total} />
                          </td>
                          <td className="py-3 px-3 text-center">
                            {overallPct !== null ? (
                              <span className={`
                                inline-block px-2 py-0.5 rounded-full text-xs font-semibold
                                ${overallPct >= 80
                                  ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                                  : overallPct >= 50
                                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                                    : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                                }
                              `}>
                                {overallPct}%
                              </span>
                            ) : (
                              <span className="text-navy/30 dark:text-white/20">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* All Trackers tab */}
        {activeTab === 'trackers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.trackers.map(tracker => (
              <TrackerCard key={tracker.tracker_type} tracker={tracker} expanded />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function SummaryCard({ label, value, sublabel, color }: {
  label: string;
  value: number;
  sublabel: string;
  color: 'blue' | 'green' | 'yellow' | 'red';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20',
    green: 'bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/20',
    yellow: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-500/10 dark:border-yellow-500/20',
    red: 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20',
  };
  const valueClasses = {
    blue: 'text-blue-700 dark:text-blue-400',
    green: 'text-green-700 dark:text-green-400',
    yellow: 'text-yellow-700 dark:text-yellow-400',
    red: 'text-red-700 dark:text-red-400',
  };

  return (
    <div className={`rounded-2xl border p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-medium text-navy/60 dark:text-white/50 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueClasses[color]}`}>{value}</p>
      <p className="text-xs text-navy/40 dark:text-white/30 mt-1">{sublabel}</p>
    </div>
  );
}

function TrackerCard({ tracker, expanded }: { tracker: PKTrackerSummary; expanded?: boolean }) {
  const freshnessColors = {
    fresh: 'bg-green-500',
    stale: 'bg-yellow-500',
    overdue: 'bg-red-500',
  };

  return (
    <Link
      href={`/performance/${tracker.tracker_type}`}
      className="block bg-white dark:bg-white/5 rounded-xl border border-cream-dark/60 dark:border-white/10 p-4 hover:shadow-md hover:border-electric/30 dark:hover:border-electric/20 transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-navy dark:text-white group-hover:text-electric transition-colors">
          {tracker.label}
        </h4>
        <span className={`w-2 h-2 rounded-full mt-1.5 ${freshnessColors[tracker.freshness]}`} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold text-navy dark:text-white">
          {tracker.total_rows.toLocaleString()}
        </span>
        <span className="text-xs text-navy/40 dark:text-white/30">rows</span>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-cream-dark/40 dark:border-white/5 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-navy/50 dark:text-white/40">Frequency</span>
            <span className="text-navy/70 dark:text-white/60">{tracker.frequency}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-navy/50 dark:text-white/40">Status</span>
            <span className={`capitalize ${
              tracker.freshness === 'fresh' ? 'text-green-600 dark:text-green-400' :
              tracker.freshness === 'stale' ? 'text-yellow-600 dark:text-yellow-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {tracker.freshness}
            </span>
          </div>
          {tracker.last_synced_at && (
            <div className="flex justify-between text-xs">
              <span className="text-navy/50 dark:text-white/40">Last sync</span>
              <span className="text-navy/70 dark:text-white/60">
                {formatRelativeTime(tracker.last_synced_at)}
              </span>
            </div>
          )}
        </div>
      )}
    </Link>
  );
}

function AMScorecardRow({ am }: { am: DashboardData['am_scorecard'][0] }) {
  const fathomPct = am.fathom_videos_total > 0 ? Math.round((am.fathom_videos_watched / am.fathom_videos_total) * 100) : 0;
  const updatesPct = am.client_updates_total > 0 ? Math.round((am.client_updates_on_time / am.client_updates_total) * 100) : 0;
  const sanityPct = am.sanity_checks_total > 0 ? Math.round((am.sanity_checks_done / am.sanity_checks_total) * 100) : 0;
  const scores = [fathomPct, updatesPct, sanityPct].filter(s => s > 0);
  const avgPct = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-navy dark:text-white truncate">
          {am.account_manager_name}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <ProgressBar value={avgPct} />
        <span className={`text-xs font-semibold w-8 text-right ${
          avgPct >= 80 ? 'text-green-600 dark:text-green-400' :
          avgPct >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
          'text-red-600 dark:text-red-400'
        }`}>
          {avgPct}%
        </span>
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const colorClass = value >= 80 ? 'bg-green-500' : value >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-24 h-1.5 rounded-full bg-cream-dark/40 dark:bg-white/10 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colorClass}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function ScoreBadge({ watched, total }: { watched: number; total: number }) {
  if (total === 0) {
    return <span className="text-navy/30 dark:text-white/20">-</span>;
  }
  const pct = Math.round((watched / total) * 100);
  return (
    <span className="text-xs text-navy/70 dark:text-white/60">
      {watched}/{total}{' '}
      <span className={`font-medium ${
        pct >= 80 ? 'text-green-600 dark:text-green-400' :
        pct >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
        'text-red-600 dark:text-red-400'
      }`}>
        ({pct}%)
      </span>
    </span>
  );
}

// --- Helpers ---

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
