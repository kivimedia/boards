'use client';

import { useState, useEffect, useCallback } from 'react';
import { AIReviewResult, AIReviewVerdict, AIChangeVerdictResult } from '@/lib/types';

interface AIReviewHistoryProps {
  cardId: string;
  currentReviewId?: string;
  refreshKey?: number;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const VERDICT_BADGE: Record<AIReviewVerdict, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700' },
  approved: { label: 'Approved', bg: 'bg-green-50 border-green-200', text: 'text-green-700' },
  revisions_needed: { label: 'Revisions Needed', bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
  overridden_approved: { label: 'Override (Approved)', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  overridden_rejected: { label: 'Override (Rejected)', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
};

function MiniVerdictBadge({ verdict }: { verdict: AIChangeVerdictResult }) {
  const config = {
    PASS: { bg: 'bg-green-100', text: 'text-green-700', label: 'Pass' },
    FAIL: { bg: 'bg-red-100', text: 'text-red-700', label: 'Fail' },
    PARTIAL: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Partial' },
  }[verdict.verdict];

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}

export default function AIReviewHistory({ cardId, currentReviewId, refreshKey }: AIReviewHistoryProps) {
  const [reviews, setReviews] = useState<AIReviewResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/review`);
      if (!res.ok) throw new Error('Failed to load review history');
      const json = await res.json();
      const data: AIReviewResult[] = json.data || [];
      // Sort newest first
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setReviews(data);
    } catch {
      showToast('error', 'Failed to load review history.');
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshKey]);

  // Filter out the current review from history list
  const historyReviews = reviews.filter((r) => r.id !== currentReviewId);

  if (loading) {
    return (
      <div className="py-6 flex items-center justify-center">
        <svg className="animate-spin h-5 w-5 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (historyReviews.length === 0) {
    return (
      <div className="pt-4">
        <h3 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-3 font-heading">
          Review History
        </h3>
        <p className="text-sm text-navy/30 dark:text-slate-500 text-center py-4 font-body">
          No previous reviews found.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-4">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
            animate-in fade-in slide-in-from-top-2 duration-200
            ${toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
            }
          `}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <h3 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-3 font-heading">
        Review History ({historyReviews.length})
      </h3>

      <div className="space-y-2">
        {historyReviews.map((review) => {
          const verdictInfo = VERDICT_BADGE[review.overall_verdict];
          const isExpanded = expandedId === review.id;
          const passCount = review.verdicts.filter((v) => v.verdict === 'PASS').length;
          const failCount = review.verdicts.filter((v) => v.verdict === 'FAIL').length;
          const isOverridden = review.overall_verdict === 'overridden_approved' || review.overall_verdict === 'overridden_rejected';

          return (
            <div
              key={review.id}
              className="rounded-xl border border-cream-dark dark:border-slate-700 bg-cream dark:bg-dark-surface overflow-hidden"
            >
              {/* Collapsed row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : review.id)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-cream-dark/50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${verdictInfo.bg} ${verdictInfo.text}`}>
                      {verdictInfo.label}
                    </span>
                    {review.confidence_score !== null && review.confidence_score !== undefined && (
                      <span className="text-[11px] text-navy/30 dark:text-slate-500 font-body">
                        {Math.round(review.confidence_score * 100)}% confidence
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-navy/30 dark:text-slate-500 font-body">
                    <span>
                      {new Date(review.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    {review.model_used && (
                      <span>{review.model_used}</span>
                    )}
                    <span>
                      {passCount}P / {failCount}F
                    </span>
                    {isOverridden && (
                      <span className="text-blue-600 font-semibold">Overridden</span>
                    )}
                  </div>
                </div>

                <svg
                  className={`w-4 h-4 text-navy/30 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-cream-dark dark:border-slate-700 space-y-3">
                  {/* Summary */}
                  {review.summary && (
                    <div className="pt-3">
                      <p className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1 font-heading">Summary</p>
                      <p className="text-sm text-navy/60 dark:text-slate-400 font-body">{review.summary}</p>
                    </div>
                  )}

                  {/* Override info */}
                  {isOverridden && review.override_reason && (
                    <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                      <p className="text-[11px] font-semibold text-blue-600 mb-0.5">Override Reason</p>
                      <p className="text-xs text-blue-700 font-body">{review.override_reason}</p>
                      {review.overridden_at && (
                        <p className="text-[10px] text-blue-500 font-body mt-1">
                          {new Date(review.overridden_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Individual verdicts */}
                  {review.verdicts.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
                        Verdicts
                      </p>
                      <div className="space-y-1.5">
                        {review.verdicts.map((v) => (
                          <div key={v.index} className="flex items-start gap-2 text-xs">
                            <MiniVerdictBadge verdict={v} />
                            <div className="flex-1 min-w-0">
                              <p className="text-navy/60 dark:text-slate-400 font-body">{v.reasoning}</p>
                              {v.suggestions && (
                                <p className="text-navy/40 dark:text-slate-500 font-body mt-0.5 italic">{v.suggestions}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Change requests */}
                  {review.change_requests.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
                        Change Requests
                      </p>
                      <div className="space-y-1">
                        {review.change_requests.map((cr) => (
                          <div key={cr.index} className="flex items-start gap-2 text-xs text-navy/50 dark:text-slate-400 font-body">
                            <span className="w-4 h-4 rounded-full bg-electric/10 text-electric text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {cr.index + 1}
                            </span>
                            <span>{cr.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
