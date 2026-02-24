'use client';

import { useState, useEffect } from 'react';

interface CostEntry {
  service: string;
  operation: string;
  credits_used: number;
  cost_usd: number;
  created_at: string;
}

interface CostReport {
  total_cost: number;
  by_service: Record<string, { cost: number; credits: number; count: number }>;
  entries: CostEntry[];
}

const SERVICE_COLORS: Record<string, string> = {
  hunter: 'bg-orange-500',
  snov: 'bg-blue-500',
  anthropic: 'bg-purple-500',
  resend: 'bg-green-500',
};

const SERVICE_LABELS: Record<string, string> = {
  hunter: 'Hunter.io',
  snov: 'Snov.io',
  anthropic: 'Anthropic AI',
  resend: 'Resend',
};

interface CostDashboardProps {
  className?: string;
}

export default function CostDashboard({ className }: CostDashboardProps) {
  const [report, setReport] = useState<CostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCosts();
  }, [timeRange]);

  const loadCosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (timeRange !== 'all') {
        const days = timeRange === '7d' ? 7 : 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        params.set('since', since);
      }

      const res = await fetch(`/api/podcast/costs?${params}`);
      const json = await res.json();
      if (json.data?.report) {
        setReport(json.data.report);
      } else {
        // Empty report
        setReport({ total_cost: 0, by_service: {}, entries: [] });
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
      <div className={`flex items-center justify-center py-12 ${className || ''}`}>
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-12 ${className || ''}`}>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!report) return null;

  const services = Object.entries(report.by_service);
  const maxCost = Math.max(...services.map(([, s]) => s.cost), 0.001);

  return (
    <div className={`space-y-4 ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
          Scout Pipeline Costs
        </h3>
        <div className="flex gap-1">
          {(['7d', '30d', 'all'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-colors ${
                timeRange === range
                  ? 'bg-electric text-white'
                  : 'bg-navy/5 dark:bg-slate-800 text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300'
              }`}
            >
              {range === 'all' ? 'All' : range === '7d' ? '7 days' : '30 days'}
            </button>
          ))}
        </div>
      </div>

      {/* Total */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
        <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
          Total Spend
        </span>
        <p className="text-2xl font-bold text-navy dark:text-slate-100 font-heading mt-1">
          ${report.total_cost.toFixed(2)}
        </p>
        <p className="text-xs text-navy/40 dark:text-slate-500 mt-0.5">
          {services.reduce((sum, [, s]) => sum + s.count, 0)} API calls
        </p>
      </div>

      {/* Per-service breakdown */}
      {services.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4 space-y-3">
          <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
            By Service
          </span>
          {services.map(([service, data]) => (
            <div key={service} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-navy dark:text-slate-200">
                  {SERVICE_LABELS[service] || service}
                </span>
                <span className="text-sm font-bold text-navy dark:text-slate-100">
                  ${data.cost.toFixed(3)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-navy/5 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${SERVICE_COLORS[service] || 'bg-gray-400'}`}
                    style={{ width: `${(data.cost / maxCost) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-navy/30 dark:text-slate-600 w-16 text-right">
                  {data.count} calls
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700">
          <p className="text-sm text-navy/40 dark:text-slate-500">No costs recorded yet</p>
          <p className="text-xs text-navy/30 dark:text-slate-600 mt-1">
            Run the scout pipeline to generate cost data
          </p>
        </div>
      )}

      {/* Recent activity */}
      {report.entries.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
          <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2 block">
            Recent Activity
          </span>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {report.entries.slice(0, 20).map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full shrink-0 ${SERVICE_COLORS[entry.service] || 'bg-gray-400'}`} />
                <span className="text-navy/60 dark:text-slate-400 flex-1 truncate">
                  {entry.operation}
                </span>
                <span className="text-navy/40 dark:text-slate-500 shrink-0">
                  ${Number(entry.cost_usd).toFixed(4)}
                </span>
                <span className="text-navy/20 dark:text-slate-700 shrink-0 text-[10px]">
                  {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
