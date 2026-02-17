'use client';

import { useState, useEffect, useCallback } from 'react';
import BrainQueryInput from './BrainQueryInput';
import BrainDocumentList from './BrainDocumentList';

interface ClientBrainPanelProps {
  clientId: string;
}

interface QueryResult {
  response: string;
  confidence: number;
  sources: { document_id: string; title: string; similarity: number }[];
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

interface BrainStats {
  total: number;
  bySource: Record<string, number>;
}

type Tab = 'query' | 'documents';

function confidenceLabel(confidence: number): { text: string; color: string } {
  if (confidence >= 0.8) return { text: 'High', color: 'text-green-700 bg-green-50 border-green-200' };
  if (confidence >= 0.5) return { text: 'Medium', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' };
  return { text: 'Low', color: 'text-red-700 bg-red-50 border-red-200' };
}

export default function ClientBrainPanel({ clientId }: ClientBrainPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('query');
  const [isLoading, setIsLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [stats, setStats] = useState<BrainStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/brain/stats`);
      if (!res.ok) throw new Error('Failed to load stats');
      const json = await res.json();
      setStats(json.data || { total: 0, bySource: {} });
    } catch {
      // Stats are non-critical, silently fail
      setStats({ total: 0, bySource: {} });
    } finally {
      setLoadingStats(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleQuery = async (query: string) => {
    setIsLoading(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/brain/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Query failed');
      }

      const json = await res.json();
      setQueryResult(json.data);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Client AI Brain</h3>
          </div>

          {/* Stats badge */}
          {!loadingStats && stats && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-electric/10 text-electric text-xs font-medium font-body">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              {stats.total} docs
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => setActiveTab('query')}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-medium font-body transition-all
              ${activeTab === 'query'
                ? 'bg-electric text-white shadow-sm'
                : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-800'
              }
            `}
          >
            Query
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-medium font-body transition-all
              ${activeTab === 'documents'
                ? 'bg-electric text-white shadow-sm'
                : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-800'
              }
            `}
          >
            Documents
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {activeTab === 'query' && (
          <div className="space-y-4">
            <BrainQueryInput onQuery={handleQuery} isLoading={isLoading} />

            {/* Error */}
            {queryError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 font-body">
                {queryError}
              </div>
            )}

            {/* Result */}
            {queryResult && (
              <div className="space-y-3">
                {/* Confidence badge */}
                <div className="flex items-center gap-2">
                  <span
                    className={`
                      inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium font-body
                      ${confidenceLabel(queryResult.confidence).color}
                    `}
                  >
                    {confidenceLabel(queryResult.confidence).text} confidence
                  </span>
                  <span className="text-xs text-navy/30 dark:text-slate-600 font-body">
                    {queryResult.modelUsed}
                  </span>
                </div>

                {/* Response */}
                <div className="p-4 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700">
                  <p className="text-sm text-navy dark:text-slate-100 font-body whitespace-pre-wrap leading-relaxed">
                    {queryResult.response}
                  </p>
                </div>

                {/* Sources */}
                {queryResult.sources.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading mb-2">
                      Sources
                    </p>
                    <div className="space-y-1">
                      {queryResult.sources.map((source, idx) => (
                        <div
                          key={source.document_id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cream/50 dark:bg-navy/50 border border-cream-dark dark:border-slate-700 text-xs font-body"
                        >
                          <span className="text-navy/30 dark:text-slate-600 font-medium">{idx + 1}.</span>
                          <span className="text-navy dark:text-slate-100 truncate flex-1">{source.title}</span>
                          <span className="text-navy/40 dark:text-slate-500 shrink-0">
                            {(source.similarity * 100).toFixed(0)}% match
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Token usage */}
                <p className="text-xs text-navy/30 dark:text-slate-600 font-body text-right">
                  {queryResult.inputTokens + queryResult.outputTokens} tokens used
                </p>
              </div>
            )}

            {/* Empty state */}
            {!queryResult && !queryError && !isLoading && (
              <div className="py-6 text-center">
                <svg className="w-10 h-10 text-navy/15 dark:text-slate-700 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
                  Ask a question about this client&apos;s projects, history, or preferences.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <BrainDocumentList clientId={clientId} />
        )}
      </div>
    </div>
  );
}
