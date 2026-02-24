'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { PGACandidate, PGACandidateStatus, PGAConfidence, PGAQualityTier } from '@/lib/types';
import TierBadge from './TierBadge';
import QualityScoreBar from './QualityScoreBar';
import DossierViewer from './DossierViewer';
import OutreachEmailPanel from './OutreachEmailPanel';

const STATUS_COLORS: Record<PGACandidateStatus, string> = {
  scouted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  outreach_active: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  replied: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  scheduled: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  interviewed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const CONFIDENCE_COLORS: Record<PGAConfidence, string> = {
  high: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const STATUS_OPTIONS: PGACandidateStatus[] = [
  'scouted', 'approved', 'outreach_active', 'replied', 'scheduled', 'interviewed', 'rejected',
];

/** Try to extract a location hint from one_liner or source */
function extractLocation(candidate: PGACandidate): string | null {
  const text = candidate.one_liner || '';
  // Common patterns: "UK-based", "Based in NYC", "from Berlin", "Austin, TX"
  const patterns = [
    /\b(US|UK|USA|Canada|Australia|Germany|France|India|Israel|Brazil|Japan|Spain|Netherlands|Singapore|Dubai|UAE)\b/i,
    /\bbased in ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
    /\bfrom ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
    /\b((?:UK|US|AU|CA)-based)/i,
    /\b([A-Z][a-z]+,\s*[A-Z]{2})\b/,  // City, ST format
    /\bin ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/i,
  ];
  for (const p of patterns) {
    const match = text.match(p);
    if (match) return match[1] || match[0];
  }
  // Check source channel for hints
  const src = candidate.source;
  if (src && typeof src === 'object') {
    const url = (src as Record<string, string>).url || '';
    if (url.includes('.co.uk') || url.includes('uk.')) return 'UK';
    if (url.includes('.de') || url.includes('germany')) return 'Germany';
  }
  return null;
}

export default function ApprovalQueue() {
  const [candidates, setCandidates] = useState<PGACandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PGACandidateStatus | ''>('scouted');
  const [confidenceFilter, setConfidenceFilter] = useState<PGAConfidence | ''>('');
  const [emailFilter, setEmailFilter] = useState<'all' | 'has_email' | 'no_email'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [dossierExistsMap, setDossierExistsMap] = useState<Record<string, boolean>>({});
  const [scoreBreakdown, setScoreBreakdown] = useState<Record<string, any>>({});

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (confidenceFilter) params.set('confidence', confidenceFilter);
    if (emailFilter === 'has_email') params.set('has_email', 'true');
    if (emailFilter === 'no_email') params.set('has_email', 'false');
    if (search) params.set('search', search);
    params.set('limit', '50');

    try {
      const res = await fetch(`/api/podcast/candidates?${params}`);
      const json = await res.json();
      if (json.data) {
        setCandidates(json.data.candidates || []);
        setTotal(json.data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch candidates:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, confidenceFilter, emailFilter, search]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, confidenceFilter, emailFilter, search]);

  const updateCandidate = async (id: string, updates: Partial<PGACandidate>) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/podcast/candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await fetchCandidates();
      }
    } catch (err) {
      console.error('Failed to update candidate:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = (id: string) => updateCandidate(id, { status: 'approved' });
  const handleReject = (id: string, reason?: string) =>
    updateCandidate(id, { status: 'rejected', rejection_reason: reason || 'Not a fit' });

  // Bulk operations
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const approvable = candidates.filter((c) => c.status === 'scouted');
    if (selectedIds.size === approvable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(approvable.map((c) => c.id)));
    }
  };

  const bulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const promises = Array.from(selectedIds).map((id) =>
        fetch(`/api/podcast/candidates/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' }),
        })
      );
      await Promise.all(promises);
      setSelectedIds(new Set());
      await fetchCandidates();
    } catch (err) {
      console.error('Bulk approve failed:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkReject = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const promises = Array.from(selectedIds).map((id) =>
        fetch(`/api/podcast/candidates/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'rejected', rejection_reason: 'Bulk rejected' }),
        })
      );
      await Promise.all(promises);
      setSelectedIds(new Set());
      await fetchCandidates();
    } catch (err) {
      console.error('Bulk reject failed:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  // Score all visible candidates that don't have a score
  const scoreBatch = async () => {
    const unscored = candidates.filter((c) => c.quality_score == null || c.quality_score === 0);
    if (unscored.length === 0) return;
    setScoreLoading(true);
    try {
      const res = await fetch('/api/podcast/candidates/score-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_ids: unscored.map((c) => c.id) }),
      });
      if (res.ok) {
        await fetchCandidates();
      }
    } catch (err) {
      console.error('Batch scoring failed:', err);
    } finally {
      setScoreLoading(false);
    }
  };

  // Load quality score breakdown for a candidate
  const loadScoreBreakdown = async (id: string) => {
    if (scoreBreakdown[id]) return;
    try {
      const res = await fetch(`/api/podcast/candidates/${id}/score`);
      const json = await res.json();
      if (json.data?.breakdown) {
        setScoreBreakdown((prev) => ({ ...prev, [id]: json.data.breakdown }));
      }
    } catch {
      // ignore
    }
  };

  const scoutedCandidates = candidates.filter((c) => c.status === 'scouted');
  const hasScoutedInView = scoutedCandidates.length > 0;
  const allScoutedSelected = hasScoutedInView && selectedIds.size === scoutedCandidates.length;

  return (
    <div className="flex-1 overflow-auto p-6 bg-cream dark:bg-slate-900">
      {/* Navigation tabs */}
      <div className="flex items-center gap-4 mb-5">
        <Link
          href="/podcast/dashboard"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
        >
          Dashboard
        </Link>
        <span className="text-navy/20 dark:text-slate-600">/</span>
        <span className="text-sm font-semibold text-navy dark:text-slate-100">
          Guest Approval
        </span>
        <Link
          href="/podcast/outreach"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
        >
          Outreach
        </Link>
      </div>

      {/* AI-Generated warning banner */}
      <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Web-Sourced Leads - Verify Before Outreach
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
              Candidates were found via AI web search. Names and websites are based on real search results,
              but emails may be guessed and details may be inaccurate. Verify each candidate before approving.
            </p>
          </div>
          <button
            onClick={async () => {
              if (!confirm('Reject ALL unverified candidates (scouted + approved)? This will mark them all as rejected.')) return;
              setBulkLoading(true);
              try {
                // Fetch ALL non-rejected candidates regardless of current filter
                const res = await fetch('/api/podcast/candidates?limit=500');
                const json = await res.json();
                const allCandidates = (json.data?.candidates || []) as PGACandidate[];
                const rejectable = allCandidates.filter(
                  (c) => c.status !== 'rejected' && !c.email_verified
                );
                if (rejectable.length === 0) {
                  alert('No unverified candidates to reject.');
                  setBulkLoading(false);
                  return;
                }
                await Promise.all(
                  rejectable.map((c) =>
                    fetch(`/api/podcast/candidates/${c.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'rejected', rejection_reason: 'AI-generated / unverified' }),
                    })
                  )
                );
                await fetchCandidates();
              } catch (err) {
                console.error('Reject all failed:', err);
              } finally {
                setBulkLoading(false);
              }
            }}
            disabled={bulkLoading}
            className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
          >
            {bulkLoading ? 'Rejecting...' : 'Reject all unverified'}
          </button>
        </div>
      </div>

      {/* Filters + Bulk actions */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or one-liner..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-electric/30 focus:border-electric outline-none"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PGACandidateStatus | '')}
          className="px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>

        <select
          value={confidenceFilter}
          onChange={(e) => setConfidenceFilter(e.target.value as PGAConfidence | '')}
          className="px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100"
        >
          <option value="">All Confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value as 'all' | 'has_email' | 'no_email')}
          className="px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100"
        >
          <option value="all">All Contacts</option>
          <option value="has_email">Has Email</option>
          <option value="no_email">No Email</option>
        </select>

        <div className="flex items-center gap-2 text-sm text-navy/50 dark:text-slate-400">
          {total} candidate{total !== 1 ? 's' : ''}
          {candidates.some((c) => c.quality_score == null || c.quality_score === 0) && (
            <button
              onClick={scoreBatch}
              disabled={scoreLoading}
              className="px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
            >
              {scoreLoading ? 'Scoring...' : 'Score All'}
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {hasScoutedInView && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-white dark:bg-slate-800 border border-navy/5 dark:border-slate-700">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allScoutedSelected}
              onChange={selectAll}
              className="w-4 h-4 rounded border-navy/20 dark:border-slate-600 text-electric focus:ring-electric/30 cursor-pointer"
            />
            <span className="text-sm text-navy/60 dark:text-slate-400">
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : `Select all ${scoutedCandidates.length} scouted`}
            </span>
          </label>

          {selectedIds.size > 0 && (
            <>
              <div className="w-px h-5 bg-navy/10 dark:bg-slate-600" />
              <button
                onClick={bulkApprove}
                disabled={bulkLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {bulkLoading ? 'Approving...' : `Approve ${selectedIds.size}`}
              </button>
              <button
                onClick={bulkReject}
                disabled={bulkLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
              >
                Reject {selectedIds.size}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-2 py-1.5 text-xs text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 transition-colors"
              >
                Clear
              </button>
            </>
          )}

          {!selectedIds.size && scoutedCandidates.length > 0 && (
            <>
              <div className="w-px h-5 bg-navy/10 dark:bg-slate-600" />
              <button
                onClick={() => {
                  setSelectedIds(new Set(scoutedCandidates.map((c) => c.id)));
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-electric hover:bg-electric/10 transition-colors"
              >
                Select all to approve
              </button>
            </>
          )}
        </div>
      )}

      {/* Candidates list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-20 text-navy/40 dark:text-slate-500">
          <p className="text-lg font-heading">No candidates found</p>
          <p className="text-sm mt-1">Run the Scout agent or adjust your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((candidate) => {
            const isExpanded = expandedId === candidate.id;
            const isActioning = actionLoading === candidate.id;
            const isSelected = selectedIds.has(candidate.id);
            const isScouted = candidate.status === 'scouted';
            const location = extractLocation(candidate);

            return (
              <div
                key={candidate.id}
                className={`bg-white dark:bg-slate-800 rounded-xl border overflow-hidden transition-all ${
                  isSelected
                    ? 'border-electric/40 ring-1 ring-electric/20'
                    : 'border-navy/5 dark:border-slate-700'
                } shadow-sm`}
              >
                {/* Card header */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-cream/50 dark:hover:bg-slate-700/30 transition-colors"
                  onClick={() => {
                    const nextId = isExpanded ? null : candidate.id;
                    setExpandedId(nextId);
                    if (nextId && !(candidate.id in dossierExistsMap)) {
                      // Check if dossier exists for outreach panel
                      fetch(`/api/podcast/candidates/${candidate.id}/dossier`)
                        .then((r) => r.json())
                        .then((json) => {
                          setDossierExistsMap((prev) => ({ ...prev, [candidate.id]: !!json.data?.dossier }));
                        })
                        .catch(() => {});
                    }
                  }}
                >
                  {/* Checkbox for scouted candidates */}
                  {isScouted && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(candidate.id)}
                        className="w-4 h-4 rounded border-navy/20 dark:border-slate-600 text-electric focus:ring-electric/30 cursor-pointer shrink-0"
                      />
                    </div>
                  )}

                  {/* Confidence badge */}
                  {candidate.scout_confidence && (
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${CONFIDENCE_COLORS[candidate.scout_confidence]}`}
                    >
                      {candidate.scout_confidence}
                    </span>
                  )}

                  {/* Tier badge */}
                  {candidate.tier && (
                    <TierBadge tier={candidate.tier as PGAQualityTier} score={candidate.quality_score ?? undefined} compact />
                  )}

                  {/* Name + one-liner + location */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-navy dark:text-slate-100 font-heading">
                        {candidate.name}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_COLORS[candidate.status]}`}
                      >
                        {candidate.status.replace(/_/g, ' ')}
                      </span>
                      {!candidate.email_verified && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Unverified
                        </span>
                      )}
                      {location && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-navy/50 dark:text-slate-400">
                          {location}
                        </span>
                      )}
                    </div>
                    {candidate.one_liner && (
                      <p className="text-sm text-navy/60 dark:text-slate-400 truncate mt-0.5 font-body">
                        {candidate.one_liner}
                      </p>
                    )}
                  </div>

                  {/* Tools used */}
                  {candidate.tools_used && candidate.tools_used.length > 0 && (
                    <div className="hidden sm:flex gap-1 shrink-0">
                      {candidate.tools_used.slice(0, 3).map((tool) => (
                        <span
                          key={tool}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-navy/60 dark:text-slate-300"
                        >
                          {tool}
                        </span>
                      ))}
                      {candidate.tools_used.length > 3 && (
                        <span className="text-[10px] text-navy/40 dark:text-slate-500">
                          +{candidate.tools_used.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Quick actions (for scouted candidates) */}
                  {isScouted && !isSelected && (
                    <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleApprove(candidate.id)}
                        disabled={isActioning}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {isActioning ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleReject(candidate.id)}
                        disabled={isActioning}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {/* Expand chevron */}
                  <svg
                    className={`w-4 h-4 text-navy/30 dark:text-slate-500 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-navy/5 dark:border-slate-700 p-4 bg-cream/30 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Contact info */}
                      <div>
                        <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">
                          Contact
                        </h4>
                        {candidate.email && (
                          <p className="text-sm text-navy dark:text-slate-200 font-body">
                            {candidate.email}
                            {candidate.email_verified && (
                              <span className="ml-1 text-green-600 text-xs">verified</span>
                            )}
                          </p>
                        )}
                        <p className="text-sm text-navy/60 dark:text-slate-400 font-body">
                          Best contact: {candidate.contact_method || 'email'}
                        </p>
                        {location && (
                          <p className="text-sm text-navy/60 dark:text-slate-400 font-body mt-1">
                            Location: {location}
                          </p>
                        )}
                      </div>

                      {/* Platform presence */}
                      {candidate.platform_presence &&
                        Object.keys(candidate.platform_presence).length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">
                              Platforms
                            </h4>
                            <div className="space-y-1">
                              {Object.entries(candidate.platform_presence).map(
                                ([platform, url]) => (
                                  <a
                                    key={platform}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-sm text-electric hover:underline truncate font-body"
                                  >
                                    {platform}: {url}
                                  </a>
                                )
                              )}
                            </div>
                          </div>
                        )}

                      {/* Evidence of paid work */}
                      {candidate.evidence_of_paid_work &&
                        (candidate.evidence_of_paid_work as any[]).length > 0 && (
                          <div className="md:col-span-2">
                            <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">
                              Evidence of Paid Work
                            </h4>
                            <div className="space-y-2">
                              {(candidate.evidence_of_paid_work as any[]).map(
                                (evidence: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="text-sm bg-white dark:bg-slate-800 rounded-lg p-3 border border-navy/5 dark:border-slate-700"
                                  >
                                    <span className="font-semibold text-navy dark:text-slate-100">
                                      {evidence.project}
                                    </span>
                                    {evidence.description && (
                                      <span className="text-navy/60 dark:text-slate-400 ml-1">
                                        {evidence.description}
                                      </span>
                                    )}
                                    {evidence.url && (
                                      <a
                                        href={evidence.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-2 text-electric hover:underline text-xs"
                                      >
                                        View
                                      </a>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                      {/* Estimated reach */}
                      {candidate.estimated_reach &&
                        Object.keys(candidate.estimated_reach).length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">
                              Estimated Reach
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(candidate.estimated_reach).map(
                                ([platform, count]) => (
                                  <span
                                    key={platform}
                                    className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-navy/70 dark:text-slate-300"
                                  >
                                    {platform}: {typeof count === 'number' ? count.toLocaleString() : count}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        )}

                      {/* Source */}
                      {candidate.source && Object.keys(candidate.source).length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">
                            Source
                          </h4>
                          {Object.entries(candidate.source).map(([key, val]) => (
                            <p key={key} className="text-sm text-navy/60 dark:text-slate-400 font-body">
                              {key}: {val}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Notes */}
                      {candidate.notes && (
                        <div className="md:col-span-2">
                          <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">
                            Notes
                          </h4>
                          <p className="text-sm text-navy/60 dark:text-slate-400 whitespace-pre-wrap font-body">
                            {candidate.notes}
                          </p>
                        </div>
                      )}

                      {/* Rejection reason */}
                      {candidate.status === 'rejected' && candidate.rejection_reason && (
                        <div className="md:col-span-2">
                          <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase mb-2">
                            Rejection Reason
                          </h4>
                          <p className="text-sm text-red-700 dark:text-red-300 font-body">
                            {candidate.rejection_reason}
                          </p>
                        </div>
                      )}

                      {/* Quality Score */}
                      {candidate.quality_score != null && candidate.quality_score > 0 && (
                        <div className="md:col-span-2">
                          <QualityScoreBar
                            score={candidate.quality_score}
                            tier={(candidate.tier as PGAQualityTier) || 'cold'}
                            breakdown={scoreBreakdown[candidate.id]}
                            showBreakdown={!!scoreBreakdown[candidate.id]}
                          />
                          {!scoreBreakdown[candidate.id] && (
                            <button
                              onClick={() => loadScoreBreakdown(candidate.id)}
                              className="mt-1 text-[10px] text-electric hover:underline"
                            >
                              Show breakdown
                            </button>
                          )}
                        </div>
                      )}

                      {/* Research Dossier */}
                      <div className="md:col-span-2">
                        <DossierViewer
                          candidateId={candidate.id}
                          candidateName={candidate.name}
                        />
                      </div>

                      {/* Outreach Emails */}
                      {candidate.status !== 'scouted' && candidate.status !== 'rejected' && (
                        <div className="md:col-span-2">
                          <OutreachEmailPanel
                            candidateId={candidate.id}
                            candidateName={candidate.name}
                            hasDossier={dossierExistsMap[candidate.id] ?? false}
                            onRefresh={fetchCandidates}
                          />
                        </div>
                      )}
                    </div>

                    {/* Full actions bar */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-navy/5 dark:border-slate-700">
                      {candidate.status === 'scouted' && (
                        <>
                          <button
                            onClick={() => handleApprove(candidate.id)}
                            disabled={isActioning}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            Approve for Outreach
                          </button>
                          <button
                            onClick={() => handleReject(candidate.id)}
                            disabled={isActioning}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200 disabled:opacity-50 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {candidate.status === 'rejected' && (
                        <button
                          onClick={() => updateCandidate(candidate.id, { status: 'scouted' })}
                          disabled={isActioning}
                          className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 disabled:opacity-50 transition-colors"
                        >
                          Move back to Scouted
                        </button>
                      )}
                      <div className="flex-1" />
                      <span className="text-xs text-navy/30 dark:text-slate-600 self-center font-body">
                        Added {new Date(candidate.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
