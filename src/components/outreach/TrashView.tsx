'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface TrashedLead {
  id: string;
  full_name: string;
  job_position: string | null;
  pipeline_stage: string;
  lead_score: number;
  deleted_at: string;
  purge_after: string | null;
  days_since_deleted: number;
  days_until_purge: number | null;
}

export default function TrashView() {
  const [leads, setLeads] = useState<TrashedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/trash');
      const data = await res.json();
      if (res.ok) setLeads(data.data.leads || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrash(); }, []);

  const handleAction = async (action: 'restore' | 'permanent_delete' | 'empty_trash') => {
    setActionLoading(true);
    try {
      const body: Record<string, unknown> = { action };
      if (action !== 'empty_trash') {
        body.lead_ids = Array.from(selected);
      }
      await fetch('/api/outreach/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSelected(new Set());
      fetchTrash();
    } finally {
      setActionLoading(false);
    }
  };

  const toggleAll = () => {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map(l => l.id)));
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/outreach" className="text-sm text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors">
            Dashboard
          </Link>
          <span className="text-navy/20 dark:text-slate-700">/</span>
          <span className="text-sm font-semibold text-navy dark:text-white font-heading">Trash</span>
        </div>
        {leads.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Permanently delete ALL trashed leads? This cannot be undone.')) {
                handleAction('empty_trash');
              }
            }}
            disabled={actionLoading}
            className="px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            Empty Trash
          </button>
        )}
      </div>

      <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
        Deleted leads are kept for 30 days before automatic purge.
      </p>

      {/* Selection actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-2.5 bg-electric/5 dark:bg-electric/10 rounded-lg border border-electric/20">
          <span className="text-xs font-semibold text-electric font-heading">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <button
            onClick={() => handleAction('restore')}
            disabled={actionLoading}
            className="px-3 py-1.5 text-[11px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800/30 transition-colors"
          >
            Restore
          </button>
          <button
            onClick={() => {
              if (confirm('Permanently delete selected leads? This cannot be undone.')) {
                handleAction('permanent_delete');
              }
            }}
            disabled={actionLoading}
            className="px-3 py-1.5 text-[11px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800/30 transition-colors"
          >
            Delete Forever
          </button>
          {actionLoading && (
            <div className="w-4 h-4 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">Trash is empty</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-dark dark:border-slate-700">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === leads.length && leads.length > 0}
                    onChange={toggleAll}
                    className="rounded border-navy/20 dark:border-slate-600"
                  />
                </th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Name</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading hidden md:table-cell">Position</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Score</th>
                <th className="text-left px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading hidden sm:table-cell">Deleted</th>
                <th className="text-right px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Purge In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-dark dark:divide-slate-700/50">
              {leads.map(lead => (
                <tr key={lead.id} className="hover:bg-cream/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className="rounded border-navy/20 dark:border-slate-600"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="text-sm font-semibold text-navy/60 dark:text-slate-400 font-heading">{lead.full_name}</p>
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell">
                    <p className="text-xs text-navy/50 dark:text-slate-500 font-body truncate max-w-[200px]">
                      {lead.job_position || '-'}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-semibold text-navy/40 dark:text-slate-500 font-heading">{lead.lead_score}</span>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                      {lead.days_since_deleted}d ago
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-xs font-semibold ${
                      (lead.days_until_purge ?? 30) <= 7 ? 'text-red-500' :
                      (lead.days_until_purge ?? 30) <= 14 ? 'text-amber-500' :
                      'text-navy/40 dark:text-slate-500'
                    }`}>
                      {lead.days_until_purge !== null ? `${lead.days_until_purge}d` : '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
