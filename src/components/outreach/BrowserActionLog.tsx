'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface BrowserAction {
  id: string;
  action_type: string;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  input_data: Record<string, unknown>;
  result_data: Record<string, unknown>;
  created_at: string;
  li_leads: { id: string; full_name: string; linkedin_url: string | null } | null;
  li_outreach_messages: { id: string; template_number: number; message_text: string } | null;
}

const ACTION_LABELS: Record<string, string> = {
  connect_with_note: 'Connection Request',
  send_message: 'Message Sent',
  check_inbox: 'Inbox Check',
  check_connections: 'Connections Check',
  view_profile: 'Profile View',
  session_health_check: 'Health Check',
  withdraw_connection: 'Withdraw',
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  skipped: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
};

export default function BrowserActionLog() {
  const [actions, setActions] = useState<BrowserAction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchActions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (filterType) params.set('action_type', filterType);
      if (filterStatus) params.set('status', filterStatus);

      const res = await fetch(`/api/outreach/browser-actions?${params}`);
      const data = await res.json();
      if (res.ok) {
        setActions(data.data.actions || []);
        setTotal(data.data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchActions(); }, [page, filterType, filterStatus]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/outreach" className="text-sm text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors">
            Dashboard
          </Link>
          <span className="text-navy/20 dark:text-slate-700">/</span>
          <span className="text-sm font-semibold text-navy dark:text-white font-heading">Browser Actions</span>
        </div>
        <span className="text-[10px] text-navy/30 dark:text-slate-600">{total} actions</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-xs rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body"
        >
          <option value="">All types</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-xs rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="skipped">Skipped</option>
        </select>
      </div>

      {/* Actions list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : actions.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No browser actions yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action) => (
            <div
              key={action.id}
              className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden"
            >
              <button
                onClick={() => toggleExpand(action.id)}
                className="w-full p-3 flex items-center gap-3 text-left hover:bg-cream/50 dark:hover:bg-dark-surface/50 transition-colors"
              >
                <span className={`px-2 py-0.5 text-[9px] font-semibold rounded ${STATUS_COLORS[action.status] || ''}`}>
                  {action.status}
                </span>
                <span className="text-xs font-semibold text-navy dark:text-white font-heading">
                  {ACTION_LABELS[action.action_type] || action.action_type}
                </span>
                {action.li_leads && (
                  <span className="text-[10px] text-navy/50 dark:text-slate-400 font-body">
                    {action.li_leads.full_name}
                  </span>
                )}
                <span className="ml-auto text-[9px] text-navy/30 dark:text-slate-600">
                  {action.duration_ms ? `${(action.duration_ms / 1000).toFixed(1)}s` : ''} - {new Date(action.created_at).toLocaleString()}
                </span>
              </button>

              {expanded.has(action.id) && (
                <div className="px-3 pb-3 border-t border-cream-dark dark:border-slate-700 pt-2 space-y-2">
                  {action.error_message && (
                    <p className="text-[10px] text-red-600 dark:text-red-400 font-body">
                      Error: {action.error_message}
                    </p>
                  )}
                  {action.li_leads && (
                    <p className="text-[10px] text-navy/50 dark:text-slate-400 font-body">
                      Lead: <Link href={`/outreach/leads/${action.li_leads.id}`} className="text-electric hover:underline">{action.li_leads.full_name}</Link>
                      {action.li_leads.linkedin_url && (
                        <> - <a href={action.li_leads.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">LinkedIn</a></>
                      )}
                    </p>
                  )}
                  {Object.keys(action.input_data).length > 0 && (
                    <div>
                      <p className="text-[9px] font-semibold text-navy/40 dark:text-slate-500 uppercase mb-1">Input</p>
                      <pre className="text-[9px] text-navy/50 dark:text-slate-400 font-mono bg-cream dark:bg-dark-surface rounded p-2 overflow-x-auto">
                        {JSON.stringify(action.input_data, null, 2)}
                      </pre>
                    </div>
                  )}
                  {Object.keys(action.result_data).length > 0 && (
                    <div>
                      <p className="text-[9px] font-semibold text-navy/40 dark:text-slate-500 uppercase mb-1">Result</p>
                      <pre className="text-[9px] text-navy/50 dark:text-slate-400 font-mono bg-cream dark:bg-dark-surface rounded p-2 overflow-x-auto">
                        {JSON.stringify(action.result_data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 25 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-xs font-semibold rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-[10px] text-navy/40 dark:text-slate-500">Page {page} of {Math.ceil(total / 25)}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page * 25 >= total}
            className="px-3 py-1 text-xs font-semibold rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
