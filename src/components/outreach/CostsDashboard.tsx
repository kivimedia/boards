'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface CostData {
  by_service: Record<string, { total_cost: number; total_credits: number; count: number; success_count: number }>;
  total_cost_usd: number;
  budget_cap_usd: number;
  budget_used_pct: number;
  cost_per_qualified_lead: number;
  qualified_leads: number;
  event_count: number;
}

const SERVICE_COLORS: Record<string, string> = {
  hunter: 'bg-orange-500',
  snov: 'bg-blue-500',
  serpapi: 'bg-green-500',
  anthropic: 'bg-purple-500',
  scrapling: 'bg-cyan-500',
};

export default function CostsDashboard() {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  useEffect(() => {
    async function fetchCosts() {
      setLoading(true);
      try {
        const res = await fetch(`/api/outreach/costs?period=${period}`);
        const json = await res.json();
        if (res.ok) setData(json.data);
      } finally {
        setLoading(false);
      }
    }
    fetchCosts();
  }, [period]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/outreach" className="text-sm text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors">
            Dashboard
          </Link>
          <span className="text-navy/20 dark:text-slate-700">/</span>
          <span className="text-sm font-semibold text-navy dark:text-white font-heading">Costs</span>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 border border-cream-dark dark:border-slate-700 font-body"
        >
          <option value="day">Last 24h</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* Budget bar */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-navy dark:text-white font-heading">Budget Usage</p>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                ${data.total_cost_usd.toFixed(2)} / ${data.budget_cap_usd.toFixed(2)}
              </p>
            </div>
            <div className="w-full h-3 bg-cream-dark dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  data.budget_used_pct >= 90 ? 'bg-red-500' :
                  data.budget_used_pct >= 70 ? 'bg-amber-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${Math.min(data.budget_used_pct, 100)}%` }}
              />
            </div>
            <p className={`text-xs font-semibold mt-1 ${
              data.budget_used_pct >= 90 ? 'text-red-500' :
              data.budget_used_pct >= 70 ? 'text-amber-500' :
              'text-green-600 dark:text-green-400'
            }`}>
              {data.budget_used_pct}% used
            </p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
              <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">Total Spent</p>
              <p className="text-2xl font-bold text-navy dark:text-white font-heading mt-1">${data.total_cost_usd.toFixed(2)}</p>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
              <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">Cost/Qualified Lead</p>
              <p className="text-2xl font-bold text-electric font-heading mt-1">${data.cost_per_qualified_lead.toFixed(2)}</p>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
              <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">Qualified Leads</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 font-heading mt-1">{data.qualified_leads}</p>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
              <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">API Calls</p>
              <p className="text-2xl font-bold text-navy/60 dark:text-slate-400 font-heading mt-1">{data.event_count}</p>
            </div>
          </div>

          {/* By service */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-navy dark:text-white font-heading mb-4">Cost by Service</h2>
            {Object.keys(data.by_service).length === 0 ? (
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body text-center py-8">No cost events yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(data.by_service)
                  .sort((a, b) => b[1].total_cost - a[1].total_cost)
                  .map(([service, stats]) => (
                    <div key={service} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full shrink-0 ${SERVICE_COLORS[service] || 'bg-gray-400'}`} />
                      <span className="text-sm font-semibold text-navy dark:text-white font-heading w-24 capitalize">
                        {service}
                      </span>
                      <div className="flex-1 h-2 bg-cream-dark dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${SERVICE_COLORS[service] || 'bg-gray-400'}`}
                          style={{ width: `${data.total_cost_usd > 0 ? (stats.total_cost / data.total_cost_usd) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="text-right shrink-0 w-28">
                        <span className="text-xs font-semibold text-navy dark:text-white font-heading">
                          ${stats.total_cost.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-navy/40 dark:text-slate-500 ml-1.5">
                          {stats.count} calls
                        </span>
                      </div>
                      <span className="text-[10px] text-navy/30 dark:text-slate-600 w-12 text-right">
                        {stats.count > 0 ? Math.round((stats.success_count / stats.count) * 100) : 0}%
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
