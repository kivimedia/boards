'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  calls24h: number;
  errors24h: number;
  errorRate: number;
  avgLatencyMs: number;
  lastError: string | null;
}

interface HealthData {
  services: ServiceHealth[];
  errorRate24h: number;
  avgProcessingTime: number;
  jobBacklog: number;
  failedLeads: number;
  recoveryQueue: number;
  uptime: number;
}

export default function HealthMonitor() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/health');
      const data = await res.json();
      if (res.ok) setHealth(data.data.metrics);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHealth(); }, []);

  const statusColor = (s: string) =>
    s === 'healthy' ? 'bg-green-500' : s === 'degraded' ? 'bg-amber-500' : 'bg-red-500';

  const statusLabel = (s: string) =>
    s === 'healthy' ? 'Healthy' : s === 'degraded' ? 'Degraded' : 'Down';

  if (loading || !health) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/outreach" className="text-sm text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors">
          Dashboard
        </Link>
        <span className="text-navy/20 dark:text-slate-700">/</span>
        <span className="text-sm font-semibold text-navy dark:text-white font-heading">Agent Health</span>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Error Rate (24h)</p>
          <p className={`text-lg font-bold font-heading mt-1 ${
            health.errorRate24h > 10 ? 'text-red-600' : health.errorRate24h > 5 ? 'text-amber-600' : 'text-green-600'
          }`}>
            {health.errorRate24h.toFixed(1)}%
          </p>
        </div>
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Avg Processing</p>
          <p className="text-lg font-bold text-navy dark:text-white font-heading mt-1">
            {health.avgProcessingTime > 0 ? `${health.avgProcessingTime}ms` : 'N/A'}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Job Backlog</p>
          <p className={`text-lg font-bold font-heading mt-1 ${
            health.jobBacklog > 10 ? 'text-amber-600' : 'text-navy dark:text-white'
          }`}>
            {health.jobBacklog}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Failed Leads</p>
          <p className={`text-lg font-bold font-heading mt-1 ${
            health.failedLeads > 0 ? 'text-red-600' : 'text-navy dark:text-white'
          }`}>
            {health.failedLeads}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Recovery Queue</p>
          <p className={`text-lg font-bold font-heading mt-1 ${
            health.recoveryQueue > 0 ? 'text-amber-600' : 'text-navy dark:text-white'
          }`}>
            {health.recoveryQueue}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Uptime</p>
          <p className="text-lg font-bold text-green-600 font-heading mt-1">
            {health.uptime}h
          </p>
        </div>
      </div>

      {/* Service health table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-cream-dark dark:border-slate-700">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading">
            Service Status
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-dark dark:border-slate-700">
              <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Service</th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Status</th>
              <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Calls (24h)</th>
              <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Errors</th>
              <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Error Rate</th>
              <th className="text-right px-5 py-2.5 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Avg Latency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-dark dark:divide-slate-700/50">
            {health.services.map(svc => (
              <tr key={svc.name} className="hover:bg-cream/50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-5 py-2.5">
                  <span className="text-xs font-semibold text-navy dark:text-white font-heading">{svc.name}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${statusColor(svc.status)}`} />
                    <span className="text-xs text-navy/60 dark:text-slate-400 font-body">{statusLabel(svc.status)}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className="text-xs text-navy/60 dark:text-slate-400 font-heading">{svc.calls24h}</span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`text-xs font-heading ${svc.errors24h > 0 ? 'text-red-500 font-semibold' : 'text-navy/40 dark:text-slate-500'}`}>
                    {svc.errors24h}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`text-xs font-heading ${
                    svc.errorRate > 20 ? 'text-red-500 font-semibold' :
                    svc.errorRate > 5 ? 'text-amber-500' :
                    'text-navy/40 dark:text-slate-500'
                  }`}>
                    {svc.errorRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right">
                  <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                    {svc.avgLatencyMs > 0 ? `${svc.avgLatencyMs.toFixed(0)}ms` : '-'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
