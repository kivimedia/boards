'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AuditLogEntry } from '@/lib/types';

const ACTION_OPTIONS = [
  '',
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'sso_login',
  'ip_blocked',
  'config_change',
];

const RESOURCE_TYPE_OPTIONS = [
  '',
  'sso_config',
  'ip_whitelist',
  'user',
  'board',
  'card',
  'api_key',
  'webhook',
];

export default function AuditLogViewer() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (resourceTypeFilter) params.set('resource_type', resourceTypeFilter);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const res = await fetch(`/api/enterprise/audit-log?${params.toString()}`);
      const json = await res.json();
      if (json.data) setEntries(json.data);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, resourceTypeFilter, startDate, endDate]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">Audit Log</h3>
        <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-1">
          View a detailed log of all actions performed in the system.
        </p>
      </div>

      {/* Filters row */}
      <div className="bg-cream dark:bg-navy rounded-xl border border-cream-dark dark:border-slate-700 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-body text-navy/70 dark:text-slate-300 dark:text-slate-300 mb-1">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 bg-white dark:bg-dark-surface"
            >
              <option value="">All actions</option>
              {ACTION_OPTIONS.filter(Boolean).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-body text-navy/70 dark:text-slate-300 dark:text-slate-300 mb-1">Resource Type</label>
            <select
              value={resourceTypeFilter}
              onChange={(e) => setResourceTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 bg-white dark:bg-dark-surface"
            >
              <option value="">All types</option>
              {RESOURCE_TYPE_OPTIONS.filter(Boolean).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-body text-navy/70 dark:text-slate-300 dark:text-slate-300 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 dark:bg-dark-surface"
            />
          </div>
          <div>
            <label className="block text-xs font-body text-navy/70 dark:text-slate-300 dark:text-slate-300 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 dark:bg-dark-surface"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-navy/50 dark:text-slate-400 font-body py-8 text-center">Loading audit log...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-navy/40 dark:text-slate-500 font-body">
          No audit log entries found matching the selected filters.
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-cream-dark dark:border-slate-700 bg-cream dark:bg-navy">
                <th className="text-left px-4 py-3 font-heading text-navy dark:text-slate-100 text-xs uppercase tracking-wider">Action</th>
                <th className="text-left px-4 py-3 font-heading text-navy dark:text-slate-100 text-xs uppercase tracking-wider">Resource</th>
                <th className="text-left px-4 py-3 font-heading text-navy dark:text-slate-100 text-xs uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 font-heading text-navy dark:text-slate-100 text-xs uppercase tracking-wider">Timestamp</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className="border-b border-cream-dark/50 dark:border-slate-700/50 hover:bg-cream/30 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <td className="px-4 py-3 font-body text-navy dark:text-slate-100">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-electric/10 text-electric font-medium">
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300">
                      {entry.resource_type}
                      {entry.resource_id && (
                        <span className="text-navy/40 dark:text-slate-500 ml-1 text-xs">({entry.resource_id.slice(0, 8)}...)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-xs">
                      {entry.user_id ? entry.user_id.slice(0, 8) + '...' : 'System'}
                    </td>
                    <td className="px-4 py-3 font-body text-navy/50 dark:text-slate-400 text-xs">
                      {formatTimestamp(entry.created_at)}
                    </td>
                    <td className="px-4 py-3 text-navy/30 dark:text-slate-600 text-xs">
                      {expandedId === entry.id ? '[-]' : '[+]'}
                    </td>
                  </tr>
                  {expandedId === entry.id && (
                    <tr key={`${entry.id}-detail`} className="bg-cream/50 dark:bg-navy/50">
                      <td colSpan={5} className="px-4 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-body">
                          {entry.old_values && (
                            <div>
                              <span className="font-bold text-navy dark:text-slate-100 block mb-1">Old Values</span>
                              <pre className="bg-white dark:bg-dark-surface rounded p-2 border border-cream-dark dark:border-slate-700 overflow-auto max-h-40 text-navy/70 dark:text-slate-300">
                                {JSON.stringify(entry.old_values, null, 2)}
                              </pre>
                            </div>
                          )}
                          {entry.new_values && (
                            <div>
                              <span className="font-bold text-navy dark:text-slate-100 block mb-1">New Values</span>
                              <pre className="bg-white dark:bg-dark-surface rounded p-2 border border-cream-dark dark:border-slate-700 overflow-auto max-h-40 text-navy/70 dark:text-slate-300">
                                {JSON.stringify(entry.new_values, null, 2)}
                              </pre>
                            </div>
                          )}
                          {entry.ip_address && (
                            <div>
                              <span className="font-bold text-navy dark:text-slate-100">IP:</span>{' '}
                              <span className="text-navy/70">{entry.ip_address}</span>
                            </div>
                          )}
                          {entry.user_agent && (
                            <div>
                              <span className="font-bold text-navy dark:text-slate-100">User Agent:</span>{' '}
                              <span className="text-navy/70 break-all">{entry.user_agent}</span>
                            </div>
                          )}
                          {Object.keys(entry.metadata).length > 0 && (
                            <div className="md:col-span-2">
                              <span className="font-bold text-navy dark:text-slate-100 block mb-1">Metadata</span>
                              <pre className="bg-white dark:bg-dark-surface rounded p-2 border border-cream-dark dark:border-slate-700 overflow-auto max-h-40 text-navy/70 dark:text-slate-300">
                                {JSON.stringify(entry.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
