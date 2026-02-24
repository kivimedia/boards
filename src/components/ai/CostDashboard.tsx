'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AICostSummary } from '@/lib/types';

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  browserless: 'Browserless',
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'bg-purple-500',
  openai: 'bg-emerald-500',
  google: 'bg-blue-500',
  browserless: 'bg-amber-500',
};

const ACTIVITY_LABELS: Record<string, string> = {
  design_review: 'Design Review',
  dev_qa: 'Dev QA',
  chatbot_ticket: 'Chatbot (Ticket)',
  chatbot_board: 'Chatbot (Board)',
  chatbot_global: 'Chatbot (Global)',
  client_brain: 'Client Brain',
  nano_banana_edit: 'Nano Banana Edit',
  nano_banana_generate: 'Nano Banana Generate',
  email_draft: 'Email Draft',
  video_generation: 'Video Generation',
  brief_assist: 'Brief Assist',
};

function getDateRange(range: 'week' | 'month' | 'quarter'): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];
  const start = new Date(now);

  if (range === 'week') {
    start.setDate(start.getDate() - 7);
  } else if (range === 'month') {
    start.setMonth(start.getMonth() - 1);
  } else {
    start.setMonth(start.getMonth() - 3);
  }

  return { startDate: start.toISOString().split('T')[0], endDate };
}

export default function CostDashboard() {
  const [summary, setSummary] = useState<AICostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter'>('month');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError('');

    const { startDate, endDate } = getDateRange(dateRange);

    try {
      const res = await fetch(`/api/ai/cost-summary?startDate=${startDate}&endDate=${endDate}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setSummary(json.data);
      } else {
        setError(json.error || 'Failed to load cost summary.');
      }
    } catch {
      setError('Network error loading cost data.');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading cost data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-red-800 font-body text-sm">{error}</p>
      </div>
    );
  }

  if (!summary) return null;

  const providerEntries = Object.entries(summary.byProvider).sort(([, a], [, b]) => b - a);
  const modelEntries = Object.entries(summary.byModel).sort(([, a], [, b]) => b - a);
  const activityEntries = Object.entries(summary.byActivity).sort(([, a], [, b]) => b - a);
  const maxProviderCost = providerEntries.length > 0 ? Math.max(...providerEntries.map(([, v]) => v)) : 0;
  const maxActivityCost = activityEntries.length > 0 ? Math.max(...activityEntries.map(([, v]) => v)) : 0;
  const maxTrendCost = summary.trend.length > 0 ? Math.max(...summary.trend.map((t) => t.cost)) : 0;

  return (
    <div className="space-y-6">
      {/* Header & Date Range Filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading font-bold text-navy dark:text-slate-100">AI Cost Dashboard</h2>
        <div className="flex rounded-xl bg-cream-dark dark:bg-slate-800 p-1">
          {(['week', 'month', 'quarter'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200
                ${dateRange === range
                  ? 'bg-white dark:bg-dark-surface text-navy dark:text-slate-100 shadow-sm'
                  : 'text-navy/50 dark:text-slate-400 hover:text-navy/70 dark:hover:text-slate-200'
                }
              `}
            >
              {range === 'week' ? '7 Days' : range === 'month' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Total Spend Card */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <p className="text-navy/50 dark:text-slate-400 font-body text-xs uppercase tracking-wider mb-1">Total Spend</p>
        <p className="text-3xl font-heading font-bold text-navy dark:text-slate-100">{formatCost(summary.totalCost)}</p>
      </div>

      {/* Daily Trend */}
      {summary.trend.length > 0 && (
        <div>
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-3">Daily Trend</h3>
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-4">
            <div className="flex items-end gap-1 h-32">
              {summary.trend.map((point) => {
                const height = maxTrendCost > 0 ? Math.max(4, (point.cost / maxTrendCost) * 100) : 0;
                return (
                  <div
                    key={point.date}
                    className="flex-1 flex flex-col items-center justify-end group relative"
                  >
                    <div
                      className="w-full bg-electric/80 rounded-t hover:bg-electric transition-colors min-h-[2px]"
                      style={{ height: `${height}%` }}
                    />
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-navy text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                      {point.date}: {formatCost(point.cost)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                {summary.trend[0]?.date ?? ''}
              </span>
              <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                {summary.trend[summary.trend.length - 1]?.date ?? ''}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Spend by Provider */}
      <div>
        <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-3">Spend by Provider</h3>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
          {providerEntries.length === 0 ? (
            <div className="px-6 py-8 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
              No spending recorded.
            </div>
          ) : (
            <div className="divide-y divide-cream-dark dark:divide-slate-700">
              {providerEntries.map(([provider, cost]) => {
                const barWidth = maxProviderCost > 0 ? Math.max(4, (cost / maxProviderCost) * 100) : 0;
                const colorClass = PROVIDER_COLORS[provider] || 'bg-gray-400';
                return (
                  <div key={provider} className="px-5 py-3 flex items-center gap-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                    <div className={`w-3 h-3 rounded-full ${colorClass} flex-shrink-0`} />
                    <span className="text-sm font-body font-medium text-navy dark:text-slate-100 w-28">
                      {PROVIDER_LABELS[provider] || provider}
                    </span>
                    <div className="flex-1">
                      <div className="w-full bg-cream-dark dark:bg-slate-700 rounded-full h-2">
                        <div
                          className={`${colorClass} rounded-full h-2 transition-all duration-300`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-body font-medium text-navy/70 w-20 text-right">
                      {formatCost(cost)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Spend by Model */}
      <div>
        <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-3">Spend by Model</h3>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
          {modelEntries.length === 0 ? (
            <div className="px-6 py-8 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
              No spending recorded.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
                    <th className="text-left px-6 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Model</th>
                    <th className="text-right px-6 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-dark dark:divide-slate-700">
                  {modelEntries.map(([model, cost]) => (
                    <tr key={model} className="hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-3 font-body text-navy dark:text-slate-100">{model}</td>
                      <td className="px-6 py-3 font-body text-navy dark:text-slate-100/70 dark:text-slate-300 text-right font-medium">
                        {formatCost(cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Spend by Activity */}
      <div>
        <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-3">Spend by Activity</h3>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
          {activityEntries.length === 0 ? (
            <div className="px-6 py-8 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
              No spending recorded.
            </div>
          ) : (
            <div className="divide-y divide-cream-dark dark:divide-slate-700">
              {activityEntries.map(([activity, cost]) => {
                const barWidth = maxActivityCost > 0 ? Math.max(4, (cost / maxActivityCost) * 100) : 0;
                return (
                  <div key={activity} className="px-5 py-3 flex items-center gap-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                    <span className="text-sm font-body font-medium text-navy dark:text-slate-100 w-40">
                      {ACTIVITY_LABELS[activity] || activity}
                    </span>
                    <div className="flex-1">
                      <div className="w-full bg-cream-dark dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-electric rounded-full h-2 transition-all duration-300"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-body font-medium text-navy/70 w-20 text-right">
                      {formatCost(cost)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
