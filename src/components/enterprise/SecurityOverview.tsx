'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SSOConfig, IPWhitelistEntry, AuditLogEntry } from '@/lib/types';

interface OverviewData {
  ssoConfigs: SSOConfig[];
  ipEntries: IPWhitelistEntry[];
  recentAuditEntries: AuditLogEntry[];
  accuracyRate: number;
}

export default function SecurityOverview() {
  const [data, setData] = useState<OverviewData>({
    ssoConfigs: [],
    ipEntries: [],
    recentAuditEntries: [],
    accuracyRate: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const [ssoRes, ipRes, auditRes] = await Promise.all([
        fetch('/api/enterprise/sso'),
        fetch('/api/enterprise/ip-whitelist'),
        fetch('/api/enterprise/audit-log?limit=5'),
      ]);

      const [ssoJson, ipJson, auditJson] = await Promise.all([
        ssoRes.json(),
        ipRes.json(),
        auditRes.json(),
      ]);

      setData({
        ssoConfigs: ssoJson.data ?? [],
        ipEntries: ipJson.data ?? [],
        recentAuditEntries: auditJson.data ?? [],
        accuracyRate: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  if (loading) {
    return <div className="text-navy/50 dark:text-slate-400 font-body py-8 text-center">Loading security overview...</div>;
  }

  const activeSSOCount = data.ssoConfigs.filter((c) => c.is_active).length;
  const activeIPCount = data.ipEntries.filter((e) => e.is_active).length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">Security Overview</h3>
        <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-1">
          A summary of your enterprise security posture.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <div className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">{data.ssoConfigs.length}</div>
          <div className="text-xs text-navy/50 dark:text-slate-400 font-body mt-1">SSO Providers</div>
          <div className="text-xs text-electric font-body mt-0.5">{activeSSOCount} active</div>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <div className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">{data.ipEntries.length}</div>
          <div className="text-xs text-navy/50 dark:text-slate-400 font-body mt-1">IP Whitelist Rules</div>
          <div className="text-xs text-electric font-body mt-0.5">{activeIPCount} active</div>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <div className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">{data.recentAuditEntries.length}</div>
          <div className="text-xs text-navy/50 dark:text-slate-400 font-body mt-1">Recent Audit Events</div>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <div className="text-2xl font-bold text-electric font-heading">
            {data.accuracyRate > 0 ? `${data.accuracyRate}%` : '--'}
          </div>
          <div className="text-xs text-navy/50 dark:text-slate-400 font-body mt-1">AI Accuracy Rate</div>
        </div>
      </div>

      {/* SSO status */}
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4">
        <h4 className="text-sm font-bold text-navy dark:text-slate-100 font-heading mb-3">SSO Status</h4>
        {data.ssoConfigs.length === 0 ? (
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No SSO providers configured.</p>
        ) : (
          <div className="space-y-2">
            {data.ssoConfigs.map((config) => (
              <div key={config.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="uppercase text-xs font-bold text-electric bg-electric/10 px-1.5 py-0.5 rounded">
                    {config.provider_type}
                  </span>
                  <span className="font-body text-navy dark:text-slate-100">{config.name}</span>
                </div>
                <span
                  className={`text-xs font-body ${
                    config.is_active ? 'text-green-600' : 'text-gray-400'
                  }`}
                >
                  {config.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* IP whitelist summary */}
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4">
        <h4 className="text-sm font-bold text-navy dark:text-slate-100 font-heading mb-3">IP Whitelist</h4>
        {data.ipEntries.length === 0 ? (
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No IP restrictions. All IPs are allowed.</p>
        ) : (
          <div className="space-y-2">
            {data.ipEntries.slice(0, 5).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <code className="text-xs font-mono text-navy dark:text-slate-100 bg-cream dark:bg-navy px-1.5 py-0.5 rounded">{entry.cidr}</code>
                <span className="text-xs font-body text-navy/50 dark:text-slate-400">{entry.description || '--'}</span>
              </div>
            ))}
            {data.ipEntries.length > 5 && (
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                +{data.ipEntries.length - 5} more entries
              </p>
            )}
          </div>
        )}
      </div>

      {/* Recent audit entries */}
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4">
        <h4 className="text-sm font-bold text-navy dark:text-slate-100 font-heading mb-3">Recent Audit Activity</h4>
        {data.recentAuditEntries.length === 0 ? (
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No recent audit events.</p>
        ) : (
          <div className="space-y-2">
            {data.recentAuditEntries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-electric/10 text-electric font-body">
                    {entry.action}
                  </span>
                  <span className="text-xs font-body text-navy/60 dark:text-slate-400">{entry.resource_type}</span>
                </div>
                <span className="text-xs font-body text-navy/40 dark:text-slate-500">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
