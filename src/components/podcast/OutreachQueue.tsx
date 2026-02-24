'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { PGACandidate, PGACandidateStatus, PGAQualityTier } from '@/lib/types';
import TierBadge from './TierBadge';
import DossierViewer from './DossierViewer';
import OutreachEmailPanel from './OutreachEmailPanel';

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  outreach_active: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  replied: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  scheduled: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  interviewed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const OUTREACH_STATUSES: PGACandidateStatus[] = [
  'approved', 'outreach_active', 'replied', 'scheduled', 'interviewed',
];

const PLATFORM_ICONS: Record<string, string> = {
  twitter: 'X',
  linkedin: 'in',
  youtube: 'YT',
  github: 'GH',
  website: 'WEB',
  reddit: 'R',
};

export default function OutreachQueue() {
  const [candidates, setCandidates] = useState<PGACandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<PGACandidateStatus | ''>('approved');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dossierExistsMap, setDossierExistsMap] = useState<Record<string, boolean>>({});

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
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
  }, [statusFilter, search]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const updateStatus = async (id: string, status: PGACandidateStatus) => {
    setActionLoading(id);
    try {
      await fetch(`/api/podcast/candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await fetchCandidates();
    } catch (err) {
      console.error('Failed to update:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const getNextStatus = (current: PGACandidateStatus): PGACandidateStatus | null => {
    const flow: PGACandidateStatus[] = ['approved', 'outreach_active', 'replied', 'scheduled', 'interviewed'];
    const idx = flow.indexOf(current);
    return idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;
  };

  /** Extract the main website URL from source or platform_presence */
  const getWebsite = (c: PGACandidate): string | null => {
    // Check source URL first
    if (c.source && typeof c.source === 'object') {
      const url = (c.source as Record<string, string>).url;
      if (url) return url;
    }
    // Check platform_presence for website key
    if (c.platform_presence) {
      if (c.platform_presence.website) return c.platform_presence.website;
      // Return first platform URL as fallback
      const urls = Object.values(c.platform_presence);
      if (urls.length > 0) return urls[0];
    }
    return null;
  };

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
        <Link
          href="/podcast/approval"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
        >
          Guest Approval
        </Link>
        <span className="text-navy/20 dark:text-slate-600">/</span>
        <span className="text-sm font-semibold text-navy dark:text-slate-100">
          Outreach
        </span>
        <Link
          href="/podcast/costs"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors ml-auto"
        >
          Costs
        </Link>
        <Link
          href="/settings/podcast"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
        >
          Integrations
        </Link>
      </div>

      {/* AI-Generated warning banner */}
      <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Web-Sourced Leads - Verify Before Outreach
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
              Candidates were found via AI web search. Names and websites are based on real results,
              but emails and social profiles may be inaccurate. Confirm details before sending outreach.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-electric/30 focus:border-electric outline-none"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PGACandidateStatus | '')}
          className="px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100"
        >
          <option value="">All Outreach Statuses</option>
          {OUTREACH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>

        <div className="flex items-center text-sm text-navy/50 dark:text-slate-400">
          {total} candidate{total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Candidate cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-20 text-navy/40 dark:text-slate-500">
          <p className="text-lg font-heading">No outreach candidates</p>
          <p className="text-sm mt-1">
            Approve candidates from the{' '}
            <Link href="/podcast/approval" className="text-electric hover:underline">
              Guest Approval
            </Link>{' '}
            page first.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((candidate) => {
            const isActioning = actionLoading === candidate.id;
            const nextStatus = getNextStatus(candidate.status);
            const isExpanded = expandedId === candidate.id;
            const website = getWebsite(candidate);
            const hasPlatforms = candidate.platform_presence && Object.keys(candidate.platform_presence).length > 0;

            return (
              <div
                key={candidate.id}
                className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm overflow-hidden"
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-cream/50 dark:hover:bg-slate-700/30 transition-colors"
                  onClick={() => {
                    const nextId = isExpanded ? null : candidate.id;
                    setExpandedId(nextId);
                    if (nextId && !(candidate.id in dossierExistsMap)) {
                      fetch(`/api/podcast/candidates/${candidate.id}/dossier`)
                        .then((r) => r.json())
                        .then((json) => {
                          setDossierExistsMap((prev) => ({ ...prev, [candidate.id]: !!json.data?.dossier }));
                        })
                        .catch(() => {});
                    }
                  }}
                >
                  {/* Status */}
                  <span className={`shrink-0 text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${STATUS_COLORS[candidate.status] || 'bg-gray-100 text-gray-600'}`}>
                    {candidate.status.replace(/_/g, ' ')}
                  </span>

                  {/* Tier badge */}
                  {candidate.tier && (
                    <TierBadge tier={candidate.tier as PGAQualityTier} score={candidate.quality_score ?? undefined} compact />
                  )}

                  {/* Name + email + one-liner */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-navy dark:text-slate-100 font-heading">
                        {candidate.name}
                      </span>
                      {!candidate.email_verified && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Unverified
                        </span>
                      )}
                      {candidate.email && (
                        <span className="text-xs text-navy/40 dark:text-slate-500">
                          {candidate.email}
                        </span>
                      )}
                    </div>
                    {candidate.one_liner && (
                      <p className="text-sm text-navy/50 dark:text-slate-400 truncate mt-0.5 font-body">
                        {candidate.one_liner}
                      </p>
                    )}
                  </div>

                  {/* Platform links (inline) */}
                  {hasPlatforms && (
                    <div className="hidden md:flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {Object.entries(candidate.platform_presence).slice(0, 4).map(([platform, url]) => (
                        <a
                          key={platform}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-electric hover:bg-electric/10 dark:hover:bg-electric/20 transition-colors"
                          title={`${platform}: ${url}`}
                        >
                          {PLATFORM_ICONS[platform.toLowerCase()] || platform.slice(0, 3).toUpperCase()}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Website link */}
                  {website && (
                    <a
                      href={website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="hidden sm:inline-flex shrink-0 text-xs text-electric hover:underline items-center gap-1"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      Website
                    </a>
                  )}

                  {/* Action: advance to next status */}
                  <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {nextStatus && (
                      <button
                        onClick={() => updateStatus(candidate.id, nextStatus)}
                        disabled={isActioning}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
                      >
                        {isActioning ? '...' : `${nextStatus.replace(/_/g, ' ')}`}
                      </button>
                    )}
                    {candidate.status === 'interviewed' && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-1.5">
                        Done
                      </span>
                    )}
                  </div>

                  {/* Expand chevron */}
                  <svg
                    className={`w-4 h-4 text-navy/30 dark:text-slate-500 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-navy/5 dark:border-slate-700 p-4 bg-cream/30 dark:bg-slate-800/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Contact + Source */}
                      <div>
                        <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">Contact</h4>
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
                        {candidate.source && typeof candidate.source === 'object' && (
                          <div className="mt-2">
                            <span className="text-xs text-navy/40 dark:text-slate-500">Found via: </span>
                            <span className="text-xs text-navy/60 dark:text-slate-400">
                              {(candidate.source as Record<string, string>).channel}
                            </span>
                            {(candidate.source as Record<string, string>).url && (
                              <a
                                href={(candidate.source as Record<string, string>).url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-xs text-electric hover:underline"
                              >
                                Source link
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Platform presence */}
                      {hasPlatforms && (
                        <div>
                          <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">Platforms / Websites</h4>
                          <div className="space-y-1.5">
                            {Object.entries(candidate.platform_presence).map(([platform, url]) => (
                              <a
                                key={platform}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-electric hover:underline font-body"
                              >
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-navy/60 dark:text-slate-300">
                                  {platform}
                                </span>
                                <span className="truncate">{url}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Evidence of paid work */}
                      {candidate.evidence_of_paid_work && (candidate.evidence_of_paid_work as any[]).length > 0 && (
                        <div className="md:col-span-2">
                          <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">Evidence of Paid Work</h4>
                          <div className="space-y-2">
                            {(candidate.evidence_of_paid_work as any[]).map((evidence: any, idx: number) => (
                              <div key={idx} className="text-sm bg-white dark:bg-slate-800 rounded-lg p-3 border border-navy/5 dark:border-slate-700">
                                <span className="font-semibold text-navy dark:text-slate-100">{evidence.project}</span>
                                {evidence.description && (
                                  <span className="text-navy/60 dark:text-slate-400 ml-1">{evidence.description}</span>
                                )}
                                {evidence.url && (
                                  <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-electric hover:underline text-xs">
                                    View
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Estimated reach */}
                      {candidate.estimated_reach && Object.keys(candidate.estimated_reach).length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">Estimated Reach</h4>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(candidate.estimated_reach).map(([platform, count]) => (
                              <span key={platform} className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-navy/70 dark:text-slate-300">
                                {platform}: {typeof count === 'number' ? count.toLocaleString() : count}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tools used */}
                      {candidate.tools_used && candidate.tools_used.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">Tools Used</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {candidate.tools_used.map((tool) => (
                              <span key={tool} className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-navy/60 dark:text-slate-300">
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {candidate.notes && (
                        <div className="md:col-span-2">
                          <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2">Notes</h4>
                          <p className="text-sm text-navy/60 dark:text-slate-400 whitespace-pre-wrap font-body">{candidate.notes}</p>
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
                      <div className="md:col-span-2">
                        <OutreachEmailPanel
                          candidateId={candidate.id}
                          candidateName={candidate.name}
                          hasDossier={dossierExistsMap[candidate.id] ?? false}
                          onRefresh={fetchCandidates}
                        />
                      </div>
                    </div>

                    {/* Status actions */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-navy/5 dark:border-slate-700">
                      {nextStatus && (
                        <button
                          onClick={() => updateStatus(candidate.id, nextStatus)}
                          disabled={isActioning}
                          className="px-4 py-2 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
                        >
                          {isActioning ? '...' : `Move to ${nextStatus.replace(/_/g, ' ')}`}
                        </button>
                      )}
                      <div className="flex-1" />
                      <span className="text-xs text-navy/30 dark:text-slate-600 self-center font-body">
                        Added {new Date(candidate.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
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
