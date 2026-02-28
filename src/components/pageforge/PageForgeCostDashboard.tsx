'use client';

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CostReport {
  total_cost: number;
  build_count: number;
  avg_cost_per_build: number;
  by_agent: Record<string, number>;
  recent_builds: Array<{
    id: string;
    page_title: string;
    total_cost_usd: number;
    status: string;
    created_at: string;
  }>;
}

type Period = '7d' | '30d' | 'all';

const AGENT_COLORS: string[] = [
  'bg-electric',
  'bg-purple-500',
  'bg-orange-500',
  'bg-green-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-yellow-500',
  'bg-indigo-500',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PageForgeCostDashboard() {
  const [report, setReport] = useState<CostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('30d');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCosts();
  }, [period]);

  const loadCosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period });
      const res = await fetch(`/api/pageforge/costs?${params}`);
      const json = await res.json();
      if (json.data) {
        setReport(json.data);
      } else {
        setReport({
          total_cost: 0,
          build_count: 0,
          avg_cost_per_build: 0,
          by_agent: {},
          recent_builds: [],
        });
      }
    } catch (err) {
      console.error('Failed to load costs:', err);
      setError('Failed to load cost data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!report) return null;

  const agents = Object.entries(report.by_agent);
  const maxAgentCost = Math.max(...agents.map(([, c]) => c), 0.001);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
          PageForge Costs
        </h2>
        <div className="flex gap-1">
          {(['7d', '30d', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-colors ${
                period === p
                  ? 'bg-electric text-white'
                  : 'bg-navy/5 dark:bg-slate-800 text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300'
              }`}
            >
              {p === 'all' ? 'All' : p === '7d' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
          <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
            Total Cost
          </span>
          <p className="text-2xl font-bold text-navy dark:text-slate-100 font-heading mt-1">
            ${report.total_cost.toFixed(2)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
          <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
            Builds
          </span>
          <p className="text-2xl font-bold text-electric font-heading mt-1">
            {report.build_count}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
          <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
            Avg / Build
          </span>
          <p className="text-2xl font-bold text-warning font-heading mt-1">
            ${report.avg_cost_per_build.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Agent cost breakdown - horizontal bars */}
      {agents.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4 space-y-3">
          <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
            Cost by Agent
          </span>
          {agents
            .sort(([, a], [, b]) => b - a)
            .map(([agent, cost], idx) => (
              <div key={agent} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-navy dark:text-slate-200">
                    {agent.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </span>
                  <span className="text-sm font-bold text-navy dark:text-slate-100">
                    ${cost.toFixed(3)}
                  </span>
                </div>
                <div className="h-2 bg-navy/5 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${AGENT_COLORS[idx % AGENT_COLORS.length]}`}
                    style={{ width: `${(cost / maxAgentCost) * 100}%` }}
                  />
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Recent builds cost table */}
      {report.recent_builds.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
          <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2 block">
            Recent Builds
          </span>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {report.recent_builds.map((build) => (
              <div key={build.id} className="flex items-center gap-2 text-xs">
                <span className="text-navy/60 dark:text-slate-400 flex-1 truncate">
                  {build.page_title}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase ${
                    build.status === 'published'
                      ? 'text-success'
                      : build.status === 'failed'
                        ? 'text-danger'
                        : 'text-electric'
                  }`}
                >
                  {build.status.replace(/_/g, ' ')}
                </span>
                <span className="text-navy/40 dark:text-slate-500 shrink-0 font-bold">
                  ${build.total_cost_usd.toFixed(2)}
                </span>
                <span className="text-navy/20 dark:text-slate-700 shrink-0 text-[10px]">
                  {new Date(build.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
