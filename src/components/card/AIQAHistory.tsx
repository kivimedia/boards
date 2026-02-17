'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AIQAResult,
  QAStatus,
  QAFindingSeverity,
  QAFinding,
  QAChecklistResult,
} from '@/lib/types';

interface AIQAHistoryProps {
  cardId: string;
  currentQAId?: string;
  refreshKey?: number;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const STATUS_BADGE: Record<QAStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700' },
  running: { label: 'Running', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  passed: { label: 'Passed', bg: 'bg-green-50 border-green-200', text: 'text-green-700' },
  failed: { label: 'Failed', bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
  error: { label: 'Error', bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
};

const SEVERITY_CONFIG: Record<QAFindingSeverity, { label: string; bg: string; text: string; dotColor: string }> = {
  critical: { label: 'C', bg: 'bg-red-100', text: 'text-red-700', dotColor: 'bg-red-500' },
  major: { label: 'M', bg: 'bg-orange-100', text: 'text-orange-700', dotColor: 'bg-orange-500' },
  minor: { label: 'm', bg: 'bg-yellow-100', text: 'text-yellow-700', dotColor: 'bg-yellow-500' },
  info: { label: 'I', bg: 'bg-blue-100', text: 'text-blue-700', dotColor: 'bg-blue-500' },
};

function ScoreBadge({ score }: { score: number }) {
  let color = 'text-green-700 bg-green-100';
  if (score < 50) {
    color = 'text-red-700 bg-red-100';
  } else if (score < 70) {
    color = 'text-yellow-700 bg-yellow-100';
  }

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${color}`}>
      {score}
    </span>
  );
}

function FindingsCountBadges({ findingsCount }: { findingsCount: AIQAResult['findings_count'] }) {
  if (!findingsCount) return null;

  const entries = (Object.entries(findingsCount) as [QAFindingSeverity, number][]).filter(
    ([, count]) => count > 0
  );

  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {entries.map(([severity, count]) => {
        const config = SEVERITY_CONFIG[severity];
        return (
          <span
            key={severity}
            className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold ${config.bg} ${config.text}`}
            title={`${count} ${severity}`}
          >
            <span className={`w-1 h-1 rounded-full ${config.dotColor}`} />
            {count}
          </span>
        );
      })}
    </div>
  );
}

export default function AIQAHistory({ cardId, currentQAId, refreshKey }: AIQAHistoryProps) {
  const [qaResults, setQAResults] = useState<AIQAResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/qa`);
      if (!res.ok) throw new Error('Failed to load QA history');
      const json = await res.json();
      const data: AIQAResult[] = json.data || [];
      // Sort newest first
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setQAResults(data);
    } catch {
      showToast('error', 'Failed to load QA history.');
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshKey]);

  // Filter out the current QA result from history list
  const historyResults = qaResults.filter((r) => r.id !== currentQAId);

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

  if (historyResults.length === 0) {
    return (
      <div className="pt-4">
        <h3 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-3 font-heading">
          QA History
        </h3>
        <p className="text-sm text-navy/30 dark:text-slate-500 text-center py-4 font-body">
          No previous QA runs found.
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
        QA History ({historyResults.length})
      </h3>

      <div className="space-y-2">
        {historyResults.map((qa) => {
          const statusInfo = STATUS_BADGE[qa.overall_status];
          const isExpanded = expandedId === qa.id;
          const overallScore = qa.overall_score ?? qa.results?.overall_score ?? 0;
          const findings = qa.results?.findings || [];
          const checklistResults = qa.checklist_results || qa.results?.checklist_results || [];
          const summary = qa.results?.summary || '';

          return (
            <div
              key={qa.id}
              className="rounded-xl border border-cream-dark dark:border-slate-700 bg-cream dark:bg-dark-surface overflow-hidden"
            >
              {/* Collapsed row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : qa.id)}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-cream-dark/50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusInfo.bg} ${statusInfo.text}`}>
                      {statusInfo.label}
                    </span>
                    <ScoreBadge score={overallScore} />
                    <FindingsCountBadges findingsCount={qa.findings_count} />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-navy/30 dark:text-slate-500 font-body">
                    <span>
                      {new Date(qa.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="truncate max-w-[200px]">{qa.url}</span>
                    {qa.model_used && (
                      <span>{qa.model_used}</span>
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
                  {summary && (
                    <div className="pt-3">
                      <p className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1 font-heading">Summary</p>
                      <p className="text-sm text-navy/60 dark:text-slate-400 font-body">{summary}</p>
                    </div>
                  )}

                  {/* Performance metrics */}
                  {qa.performance_metrics && (
                    <div>
                      <p className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
                        Performance
                      </p>
                      <div className="flex items-center gap-4 text-xs text-navy/50 dark:text-slate-400 font-body">
                        {qa.performance_metrics.load_time_ms != null && (
                          <span>Load: {(qa.performance_metrics.load_time_ms / 1000).toFixed(2)}s</span>
                        )}
                        {qa.performance_metrics.first_paint_ms != null && (
                          <span>FP: {(qa.performance_metrics.first_paint_ms / 1000).toFixed(2)}s</span>
                        )}
                        {qa.performance_metrics.dom_content_loaded_ms != null && (
                          <span>DCL: {(qa.performance_metrics.dom_content_loaded_ms / 1000).toFixed(2)}s</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Findings list */}
                  {findings.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
                        Findings ({findings.length})
                      </p>
                      <div className="space-y-1.5">
                        {findings.slice(0, 5).map((finding, idx) => {
                          const sevConfig = SEVERITY_CONFIG[finding.severity];
                          return (
                            <div key={idx} className="flex items-start gap-2 text-xs">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${sevConfig.bg} ${sevConfig.text} shrink-0`}>
                                {finding.severity.charAt(0).toUpperCase()}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-navy/60 dark:text-slate-400 font-body">{finding.description}</p>
                                {finding.location && (
                                  <p className="text-navy/30 dark:text-slate-500 font-body mt-0.5">{finding.location}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {findings.length > 5 && (
                          <p className="text-[11px] text-navy/30 dark:text-slate-500 font-body">
                            + {findings.length - 5} more findings
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Checklist results summary */}
                  {checklistResults.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
                        Checklist
                      </p>
                      <div className="flex items-center gap-3 text-xs font-body">
                        <span className="text-green-700">
                          {checklistResults.filter((r) => r.passed).length} passed
                        </span>
                        <span className="text-red-700">
                          {checklistResults.filter((r) => !r.passed).length} failed
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Console errors count */}
                  {qa.console_errors && qa.console_errors.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 font-body">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      {qa.console_errors.length} console error{qa.console_errors.length !== 1 ? 's' : ''}
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
