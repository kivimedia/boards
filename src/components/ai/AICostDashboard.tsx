'use client';

import { useState, useEffect, useCallback } from 'react';
import { ACTIVITY_LABELS } from '@/lib/ai/model-resolver';
import type { AIActivity } from '@/lib/types';

interface UsageSummary {
  totalSpend: number;
  totalTokens: number;
  totalCalls: number;
  byActivity: Record<string, { calls: number; tokens: number; cost: number }>;
  byProvider: Record<string, { calls: number; tokens: number; cost: number }>;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  browserless: 'Browserless',
};

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

export default function AICostDashboard() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/usage/summary');
      const json = await res.json();
      if (res.ok && json.data) {
        setSummary(json.data);
      } else {
        setError(json.error || 'Failed to load usage summary.');
      }
    } catch {
      setError('Network error loading usage data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const currentMonth = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading usage data...
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

  const activityEntries = Object.entries(summary.byActivity).sort(
    ([, a], [, b]) => b.cost - a.cost
  );

  const providerEntries = Object.entries(summary.byProvider).sort(
    ([, a], [, b]) => b.cost - a.cost
  );

  const maxActivityCost = activityEntries.length > 0
    ? Math.max(...activityEntries.map(([, v]) => v.cost))
    : 0;

  const maxProviderCost = providerEntries.length > 0
    ? Math.max(...providerEntries.map(([, v]) => v.cost))
    : 0;

  return (
    <div className="space-y-6">
      {/* Billing Period */}
      <p className="text-navy/50 dark:text-slate-400 font-body text-sm">
        Current billing period: {currentMonth}
      </p>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
          <p className="text-navy/50 dark:text-slate-400 font-body text-xs uppercase tracking-wider mb-1">Total Spend</p>
          <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">{formatCost(summary.totalSpend)}</p>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
          <p className="text-navy/50 dark:text-slate-400 font-body text-xs uppercase tracking-wider mb-1">Total Calls</p>
          <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">{summary.totalCalls.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
          <p className="text-navy/50 dark:text-slate-400 font-body text-xs uppercase tracking-wider mb-1">Total Tokens</p>
          <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">{formatTokens(summary.totalTokens)}</p>
        </div>
      </div>

      {/* By Activity */}
      <div>
        <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-3">Usage by Activity</h3>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
          {activityEntries.length === 0 ? (
            <div className="px-6 py-8 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
              No usage recorded this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
                    <th className="text-left px-6 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Activity</th>
                    <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Calls</th>
                    <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Tokens</th>
                    <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Cost</th>
                    <th className="px-6 py-3 w-40"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-dark dark:divide-slate-700">
                  {activityEntries.map(([activity, data]) => {
                    const barWidth = maxActivityCost > 0
                      ? Math.max(4, (data.cost / maxActivityCost) * 100)
                      : 0;
                    return (
                      <tr key={activity} className="hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-3 font-body font-medium text-navy dark:text-slate-100">
                          {ACTIVITY_LABELS[activity as AIActivity] || activity}
                        </td>
                        <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-right">
                          {data.calls.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-right">
                          {formatTokens(data.tokens)}
                        </td>
                        <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-right font-medium">
                          {formatCost(data.cost)}
                        </td>
                        <td className="px-6 py-3">
                          <div className="w-full bg-cream-dark dark:bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-electric rounded-full h-2 transition-all duration-300"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* By Provider */}
      <div>
        <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-3">Usage by Provider</h3>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
          {providerEntries.length === 0 ? (
            <div className="px-6 py-8 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
              No usage recorded this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
                    <th className="text-left px-6 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Provider</th>
                    <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Calls</th>
                    <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Tokens</th>
                    <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Cost</th>
                    <th className="px-6 py-3 w-40"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-dark dark:divide-slate-700">
                  {providerEntries.map(([provider, data]) => {
                    const barWidth = maxProviderCost > 0
                      ? Math.max(4, (data.cost / maxProviderCost) * 100)
                      : 0;
                    return (
                      <tr key={provider} className="hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-3 font-body font-medium text-navy dark:text-slate-100">
                          {PROVIDER_LABELS[provider] || provider}
                        </td>
                        <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-right">
                          {data.calls.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-right">
                          {formatTokens(data.tokens)}
                        </td>
                        <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-right font-medium">
                          {formatCost(data.cost)}
                        </td>
                        <td className="px-6 py-3">
                          <div className="w-full bg-cream-dark dark:bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-purple-500 rounded-full h-2 transition-all duration-300"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
