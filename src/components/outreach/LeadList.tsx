'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LI_PIPELINE_STAGES, type LIPipelineStage, type LIQualificationStatus } from '@/lib/types';
import LeadScoreGauge from './LeadScoreGauge';

interface LeadRow {
  id: string;
  full_name: string;
  job_position: string | null;
  company_name: string | null;
  city: string | null;
  state: string | null;
  email: string | null;
  pipeline_stage: LIPipelineStage;
  qualification_status: LIQualificationStatus;
  lead_score: number;
  created_at: string;
}

interface LeadListProps {
  initialStage?: LIPipelineStage;
  batchId?: string;
}

export default function LeadList({ initialStage, batchId }: LeadListProps) {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<string>(initialStage || searchParams.get('stage') || '');
  const [qualification, setQualification] = useState(searchParams.get('status') || '');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const limit = 25;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (stage) params.set('pipeline_stage', stage);
    if (qualification) params.set('qualification_status', qualification);
    if (batchId) params.set('batch_id', batchId);
    params.set('sort', sortField);
    params.set('order', sortOrder);
    params.set('page', String(page));
    params.set('limit', String(limit));

    try {
      const res = await fetch(`/api/outreach/leads?${params}`);
      const data = await res.json();
      if (res.ok) {
        setLeads(data.data.leads);
        setTotal(data.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [search, stage, qualification, batchId, sortField, sortOrder, page]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, stage, qualification]);

  const totalPages = Math.ceil(total / limit);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const toggleSelectAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map(l => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleBulkAction = async (action: 'enrich' | 'qualify' | 'delete') => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    setBulkMessage(null);
    try {
      const ids = Array.from(selected);
      if (action === 'enrich') {
        const res = await fetch('/api/outreach/leads/bulk-enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_ids: ids }),
        });
        const json = await res.json();
        if (!res.ok) {
          setBulkMessage({ type: 'error', text: json.error || 'Enrichment failed' });
          return;
        }
        setBulkMessage({ type: 'success', text: `${json.data?.enqueued || ids.length} leads queued for enrichment` });
      } else if (action === 'qualify') {
        const res = await fetch('/api/outreach/leads/bulk-qualify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_ids: ids }),
        });
        const json = await res.json();
        if (!res.ok) {
          setBulkMessage({ type: 'error', text: json.error || 'Qualification failed' });
          return;
        }
        const r = json.data;
        setBulkMessage({
          type: 'success',
          text: `Qualified: ${r.qualified}, Disqualified: ${r.disqualified}, Needs Review: ${r.needs_review}${r.errors?.length ? ` (${r.errors.length} errors)` : ''}`,
        });
      } else if (action === 'delete') {
        await Promise.all(ids.map(id =>
          fetch(`/api/outreach/leads/${id}`, { method: 'DELETE' })
        ));
        setBulkMessage({ type: 'success', text: `${ids.length} leads deleted` });
      }
      setSelected(new Set());
      fetchLeads();
    } catch (err) {
      setBulkMessage({ type: 'error', text: err instanceof Error ? err.message : 'Action failed' });
    } finally {
      setBulkLoading(false);
      setTimeout(() => setBulkMessage(null), 6000);
    }
  };

  const SortIcon = ({ field }: { field: string }) => (
    <span className="ml-1 text-[10px]">
      {sortField === field ? (sortOrder === 'asc' ? '\u2191' : '\u2193') : ''}
    </span>
  );

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-dark-card text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
        />
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-dark-card text-navy dark:text-slate-100 font-body"
        >
          <option value="">All Stages</option>
          {Object.entries(LI_PIPELINE_STAGES).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>
        <select
          value={qualification}
          onChange={(e) => setQualification(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-dark-card text-navy dark:text-slate-100 font-body"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="qualified">Qualified</option>
          <option value="disqualified">Disqualified</option>
          <option value="needs_review">Needs Review</option>
        </select>
        <span className="flex items-center text-xs text-navy/40 dark:text-slate-500 font-body">
          {total} leads
        </span>
      </div>

      {/* Bulk action feedback */}
      {bulkMessage && (
        <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs font-semibold ${
          bulkMessage.type === 'success'
            ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
        }`}>
          <span>{bulkMessage.type === 'success' ? '\u2713' : '\u2717'}</span>
          <span>{bulkMessage.text}</span>
          <button onClick={() => setBulkMessage(null)} className="ml-auto text-current opacity-50 hover:opacity-100">\u00d7</button>
        </div>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2.5 bg-electric/5 dark:bg-electric/10 rounded-lg border border-electric/20">
          <span className="text-xs font-semibold text-electric font-heading">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          <button
            onClick={() => handleBulkAction('enrich')}
            disabled={bulkLoading}
            className="px-3 py-1.5 text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800/30 transition-colors"
          >
            Enrich
          </button>
          <button
            onClick={() => handleBulkAction('qualify')}
            disabled={bulkLoading}
            className="px-3 py-1.5 text-[11px] font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-800/30 transition-colors"
          >
            Qualify
          </button>
          <button
            onClick={() => handleBulkAction('delete')}
            disabled={bulkLoading}
            className="px-3 py-1.5 text-[11px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-800/30 transition-colors"
          >
            Delete
          </button>
          {bulkLoading && (
            <div className="w-4 h-4 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : leads.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No leads found</p>
          <p className="text-xs text-navy/30 dark:text-slate-600 mt-1">Import leads or adjust your filters</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-dark dark:border-slate-700">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === leads.length && leads.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-navy/20 dark:border-slate-600"
                    />
                  </th>
                  <th
                    onClick={() => toggleSort('full_name')}
                    className="text-left px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-navy dark:hover:text-white font-heading"
                  >
                    Name<SortIcon field="full_name" />
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading hidden md:table-cell">
                    Position
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading hidden lg:table-cell">
                    Location
                  </th>
                  <th className="text-left px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                    Stage
                  </th>
                  <th
                    onClick={() => toggleSort('lead_score')}
                    className="text-left px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-navy dark:hover:text-white font-heading"
                  >
                    Score<SortIcon field="lead_score" />
                  </th>
                  <th
                    onClick={() => toggleSort('created_at')}
                    className="text-right px-3 py-3 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-navy dark:hover:text-white font-heading hidden sm:table-cell"
                  >
                    Added<SortIcon field="created_at" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-dark dark:divide-slate-700/50">
                {leads.map((lead) => {
                  const stageConfig = LI_PIPELINE_STAGES[lead.pipeline_stage];
                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-cream/50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded border-navy/20 dark:border-slate-600"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/outreach/leads/${lead.id}`}
                          className="text-sm font-semibold text-navy dark:text-white hover:text-electric transition-colors font-heading"
                        >
                          {lead.full_name}
                        </Link>
                        {lead.email && (
                          <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body truncate max-w-[180px]">
                            {lead.email}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <p className="text-xs text-navy/60 dark:text-slate-400 font-body truncate max-w-[200px]">
                          {lead.job_position || '-'}
                        </p>
                        {lead.company_name && (
                          <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body truncate max-w-[200px]">
                            {lead.company_name}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
                          {[lead.city, lead.state].filter(Boolean).join(', ') || '-'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                          style={{ backgroundColor: stageConfig?.color || '#94a3b8' }}
                        >
                          {stageConfig?.label || lead.pipeline_stage}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <LeadScoreGauge score={lead.lead_score} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                        <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                          {new Date(lead.created_at).toLocaleDateString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-cream-dark dark:border-slate-700">
              <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-700 disabled:opacity-30 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
