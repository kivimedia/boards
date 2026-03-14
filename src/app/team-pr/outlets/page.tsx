'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PROutlet, PROutletType, PRPipelineStage, PRClient } from '@/lib/types';

type PROutcomeValue = 'no_response' | 'positive' | 'neutral' | 'negative';

// Extended outlet with optional outcome fields
type PROutletWithOutcome = PROutlet & {
  outcome?: PROutcomeValue | null;
  outcome_notes?: string | null;
};

/* ------------------------------------------------------------------ */
/*  Badges                                                             */
/* ------------------------------------------------------------------ */

function PipelineBadge({ stage }: { stage: PRPipelineStage }) {
  const styles: Record<string, string> = {
    DISCOVERED: 'bg-blue-500/20 text-blue-400',
    VERIFIED: 'bg-green-500/20 text-green-400',
    QA_PASSED: 'bg-green-500/20 text-green-400',
    EMAIL_DRAFTED: 'bg-blue-500/20 text-blue-400',
    EMAIL_APPROVED: 'bg-green-500/20 text-green-400',
    SENT: 'bg-green-500/20 text-green-400',
    REPLIED: 'bg-green-500/20 text-green-400',
    EXCLUDED: 'bg-gray-500/20 text-gray-500',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[stage] || 'bg-gray-500/20 text-gray-400'}`}>
      {stage.replace(/_/g, ' ')}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Outcome Badge                                                      */
/* ------------------------------------------------------------------ */

function OutcomeBadge({ outcome }: { outcome?: PROutcomeValue | null }) {
  if (!outcome || outcome === 'no_response') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
        <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
        No response
      </span>
    );
  }
  const styles: Record<PROutcomeValue, { dot: string; text: string; label: string }> = {
    positive:    { dot: 'bg-green-400',  text: 'text-green-400',  label: 'Positive' },
    negative:    { dot: 'bg-red-400',    text: 'text-red-400',    label: 'Negative' },
    neutral:     { dot: 'bg-gray-400',   text: 'text-gray-400',   label: 'Neutral' },
    no_response: { dot: 'bg-gray-500',   text: 'text-gray-500',   label: 'No response' },
  };
  const s = styles[outcome];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot} inline-block`} />
      {s.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Outlet Slide-Over                                                  */
/* ------------------------------------------------------------------ */

function OutletSlideOver({ outlet, onClose }: { outlet: PROutletWithOutcome; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selectedOutcome, setSelectedOutcome] = useState<PROutcomeValue>(outlet.outcome || 'no_response');
  const [outcomeNotes, setOutcomeNotes] = useState(outlet.outcome_notes || '');

  const outcomeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/team-pr/outlets/${outlet.id}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ outcome: selectedOutcome, notes: outcomeNotes }),
      });
      if (!res.ok) throw new Error('Failed to save outcome');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-outlets-global'] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm sm:max-w-lg bg-[#141420] border-l border-gray-500/20 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-navy dark:text-white">{outlet.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{outlet.outlet_code}</p>
            </div>
            <button onClick={onClose} className="text-gray-500 dark:text-gray-400 hover:text-navy dark:hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Status row */}
          <div className="flex flex-wrap gap-2">
            <PipelineBadge stage={outlet.pipeline_stage} />
            {outlet.is_global && (
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                Global
              </span>
            )}
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Type', value: outlet.outlet_type || '-' },
              { label: 'Country', value: outlet.country || '-' },
              { label: 'Language', value: outlet.language || '-' },
              { label: 'Audience', value: outlet.audience_size || '-' },
              { label: 'Relevance', value: `${(outlet.relevance_score * 100).toFixed(0)}%` },
              { label: 'QA Score', value: `${(outlet.qa_score * 100).toFixed(0)}%` },
              { label: 'V. Score', value: `${(outlet.verification_score * 100).toFixed(0)}%` },
              { label: 'V. Status', value: outlet.verification_status },
            ].map((item) => (
              <div key={item.label}>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">{item.label}</span>
                <p className="text-sm text-gray-300">{item.value}</p>
              </div>
            ))}
          </div>

          {/* URL */}
          {outlet.url && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">URL</span>
              <a href={outlet.url} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-400 hover:underline truncate">{outlet.url}</a>
            </div>
          )}

          {/* Description */}
          {outlet.description && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Description</span>
              <p className="text-sm text-gray-300 mt-1">{outlet.description}</p>
            </div>
          )}

          {/* Contact */}
          <div className="p-3 rounded-lg border border-gray-500/20 bg-gray-500/5">
            <h3 className="text-xs font-medium text-gray-400 mb-2">Contact</h3>
            <div className="space-y-1">
              <p className="text-sm text-navy dark:text-white">{outlet.contact_name || 'No contact name'}</p>
              <p className="text-sm text-gray-400">{outlet.contact_email || 'No email'}</p>
              {outlet.contact_role && <p className="text-xs text-gray-500">{outlet.contact_role}</p>}
              {outlet.contact_confidence !== null && (
                <p className="text-xs text-gray-500">Confidence: {(outlet.contact_confidence! * 100).toFixed(0)}%</p>
              )}
              {outlet.contact_source && <p className="text-xs text-gray-500">Source: {outlet.contact_source}</p>}
            </div>
          </div>

          {/* Topics */}
          {outlet.topics.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Topics</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {outlet.topics.map((t) => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px]">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* QA Notes */}
          {outlet.qa_notes && (
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">QA Notes</span>
              <p className="text-sm text-gray-300 mt-1">{outlet.qa_notes}</p>
            </div>
          )}

          {/* Outcome Section */}
          <div className="p-4 rounded-lg border border-gray-500/20 bg-gray-500/5 space-y-3">
            <h3 className="text-xs font-medium text-gray-400">Outcome</h3>

            {/* Current outcome */}
            <OutcomeBadge outcome={outlet.outcome} />

            {/* Radio buttons */}
            <div className="grid grid-cols-2 gap-2">
              {(['no_response', 'positive', 'neutral', 'negative'] as PROutcomeValue[]).map((val) => {
                const labelMap: Record<PROutcomeValue, string> = {
                  no_response: 'No Response',
                  positive: 'Positive',
                  neutral: 'Neutral',
                  negative: 'Negative',
                };
                return (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`outcome-${outlet.id}`}
                      value={val}
                      checked={selectedOutcome === val}
                      onChange={() => setSelectedOutcome(val)}
                      className="accent-purple-500"
                    />
                    <span className="text-xs text-gray-300">{labelMap[val]}</span>
                  </label>
                );
              })}
            </div>

            {/* Notes */}
            <textarea
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
              rows={2}
              placeholder="Notes about this outcome..."
              className="w-full px-2 py-1.5 rounded bg-gray-500/10 border border-gray-500/20 text-navy dark:text-white text-xs outline-none focus:border-purple-500/50 resize-none"
            />

            {/* Save button */}
            <button
              onClick={() => outcomeMutation.mutate()}
              disabled={outcomeMutation.isPending}
              className="w-full px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              {outcomeMutation.isPending ? 'Saving...' : outcomeMutation.isSuccess ? 'Saved!' : 'Save Outcome'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

const OUTLET_TYPES: PROutletType[] = ['newspaper', 'magazine', 'tv', 'radio', 'podcast', 'blog', 'trade_publication', 'wire_service', 'youtube', 'online_media', 'other'];
const PIPELINE_STAGES: PRPipelineStage[] = ['DISCOVERED', 'VERIFIED', 'QA_PASSED', 'EMAIL_DRAFTED', 'EMAIL_APPROVED', 'SENT', 'REPLIED', 'EXCLUDED'];

export default function OutletDatabasePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [stageFilter, setStageFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [slideOverOutlet, setSlideOverOutlet] = useState<PROutletWithOutcome | null>(null);

  // Fetch clients for filter dropdown
  const { data: clientsData } = useQuery({
    queryKey: ['pr-clients'],
    queryFn: async () => {
      const res = await fetch('/api/team-pr/clients', { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const queryParams = new URLSearchParams();
  if (search) queryParams.set('search', search);
  if (typeFilter) queryParams.set('outlet_type', typeFilter);
  if (stageFilter) queryParams.set('pipeline_stage', stageFilter);
  if (clientFilter) queryParams.set('client_id', clientFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['pr-outlets-global', search, typeFilter, stageFilter, clientFilter],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/outlets?${queryParams.toString()}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const excludeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/team-pr/outlets/bulk-exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ outlet_ids: ids }),
      });
      if (!res.ok) throw new Error('Failed to exclude');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-outlets-global'] });
      setSelected(new Set());
    },
  });

  const promoteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/team-pr/outlets/promote-global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ outlet_ids: ids }),
      });
      if (!res.ok) throw new Error('Failed to promote');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-outlets-global'] });
      setSelected(new Set());
    },
  });

  const outlets: PROutletWithOutcome[] = data?.items || [];
  const clients: PRClient[] = clientsData?.items || [];

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === outlets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(outlets.map((o) => o.id)));
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Link href="/team-pr" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-navy dark:hover:text-white transition-colors -mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Team PR
      </Link>
      {/* Header */}
      <h1 className="text-2xl font-bold text-navy dark:text-white">Outlet Database</h1>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search outlets..."
          className="px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-navy dark:text-white text-sm outline-none focus:border-purple-500/50 w-full sm:w-64"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-navy dark:text-white text-sm outline-none"
        >
          <option value="">All Types</option>
          {OUTLET_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-navy dark:text-white text-sm outline-none"
        >
          <option value="">All Stages</option>
          {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-navy dark:text-white text-sm outline-none"
        >
          <option value="">All Clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-500/20 bg-white dark:bg-[#141420]/50">
          <span className="text-sm text-gray-300">{selected.size} selected</span>
          <button
            onClick={() => excludeMutation.mutate(Array.from(selected))}
            disabled={excludeMutation.isPending}
            className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-xs font-medium transition-colors"
          >
            Exclude Selected
          </button>
          <button
            onClick={() => promoteMutation.mutate(Array.from(selected))}
            disabled={promoteMutation.isPending}
            className="px-3 py-1.5 rounded-lg bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 text-xs font-medium transition-colors"
          >
            Promote to Global
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 rounded-lg bg-gray-500/10 animate-pulse" />)}</div>
      ) : outlets.length === 0 ? (
        <div className="rounded-xl border border-gray-500/20 p-12 text-center">
          <p className="text-gray-400">No outlets found. Adjust your filters or run a PR pipeline to discover outlets.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-500/20 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-500/5 border-b border-gray-500/20">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === outlets.length && outlets.length > 0}
                    onChange={toggleAll}
                    className="rounded border-gray-500"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Code</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Country</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Stage</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Email</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Relevance</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">QA</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Outcome</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {outlets.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-gray-500/10 hover:bg-gray-500/5 cursor-pointer transition-colors"
                  onClick={() => setSlideOverOutlet(o)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggleSelect(o.id)}
                      className="rounded border-gray-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{o.outlet_code}</td>
                  <td className="px-4 py-3 text-navy dark:text-white font-medium">{o.name}</td>
                  <td className="px-4 py-3 text-gray-400">{o.outlet_type || '-'}</td>
                  <td className="px-4 py-3 text-gray-400">{o.country || '-'}</td>
                  <td className="px-4 py-3"><PipelineBadge stage={o.pipeline_stage} /></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{o.contact_email || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${o.relevance_score >= 0.7 ? 'text-green-400' : o.relevance_score >= 0.4 ? 'text-amber-400' : 'text-gray-400'}`}>
                      {(o.relevance_score * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${o.qa_score >= 0.7 ? 'text-green-400' : o.qa_score >= 0.4 ? 'text-amber-400' : 'text-gray-400'}`}>
                      {(o.qa_score * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <OutcomeBadge outcome={o.outcome} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {o.is_global && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-400 inline"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-over */}
      {slideOverOutlet && <OutletSlideOver outlet={slideOverOutlet} onClose={() => setSlideOverOutlet(null)} />}
    </div>
  );
}
