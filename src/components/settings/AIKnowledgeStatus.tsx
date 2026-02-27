'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface KnowledgeStatus {
  cards: {
    total: number;
    indexed: number;
    pending: number;
    errors: number;
    coverage: number;
  };
  embeddings: {
    active: number;
    last_indexed_at: string | null;
  };
  board_summaries: {
    total_boards: number;
    summarized: number;
    details: Array<{
      board_id: string;
      board_name: string;
      generated_at: string;
      themes: string[];
    }>;
  };
  error_cards: Array<{
    entity_id: string;
    error: string;
    last_attempt: string;
  }>;
}

export default function AIKnowledgeStatus() {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingCards, setSyncingCards] = useState(false);
  const [syncingSummaries, setSyncingSummaries] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevIndexedRef = useRef<number | null>(null);
  const stableCountRef = useRef(0);
  const prevSummarizedRef = useRef<number | null>(null);
  const stableSummaryCountRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/knowledge-status');
      if (res.ok) {
        const data: KnowledgeStatus = await res.json();
        setStatus(data);
        return data;
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  /** Start polling every 3s. Auto-stops when numbers stabilize. */
  const startPolling = useCallback((mode: 'cards' | 'summaries' | 'bootstrap') => {
    // Reset stability tracking
    prevIndexedRef.current = null;
    stableCountRef.current = 0;
    prevSummarizedRef.current = null;
    stableSummaryCountRef.current = 0;

    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      const data = await fetchStatus();
      if (!data) return;

      // Track card indexing stability
      if (mode === 'cards' || mode === 'bootstrap') {
        if (prevIndexedRef.current !== null && data.cards.indexed === prevIndexedRef.current) {
          stableCountRef.current++;
        } else {
          stableCountRef.current = 0;
        }
        prevIndexedRef.current = data.cards.indexed;
      }

      // Track summary stability
      if (mode === 'summaries' || mode === 'bootstrap') {
        if (prevSummarizedRef.current !== null && data.board_summaries.summarized === prevSummarizedRef.current) {
          stableSummaryCountRef.current++;
        } else {
          stableSummaryCountRef.current = 0;
        }
        prevSummarizedRef.current = data.board_summaries.summarized;
      }

      // Stop polling after 4 consecutive stable reads (~12s of no change)
      const cardsDone = mode !== 'cards' && mode !== 'bootstrap' || stableCountRef.current >= 4;
      const summariesDone = mode !== 'summaries' && mode !== 'bootstrap' || stableSummaryCountRef.current >= 4;

      if (cardsDone && summariesDone) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        if (mode === 'cards') {
          setSyncingCards(false);
          setToast({ type: 'success', message: `Card sync complete: ${data.cards.indexed} cards indexed` });
        } else if (mode === 'summaries') {
          setSyncingSummaries(false);
          setToast({ type: 'success', message: `Summaries complete: ${data.board_summaries.summarized} boards summarized` });
        } else {
          setBootstrapping(false);
          setToast({ type: 'success', message: `Bootstrap complete: ${data.cards.indexed} cards indexed, ${data.board_summaries.summarized} summaries` });
        }
      }
    }, 3000);
  }, [fetchStatus]);

  /** Fire-and-forget sync, then poll for progress */
  const handleSync = (type: 'cards' | 'summaries') => {
    if (type === 'cards') setSyncingCards(true);
    else setSyncingSummaries(true);

    // Fire and forget - server processes independently
    fetch('/api/settings/knowledge-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    }).catch(() => {
      // If the request itself fails (network), stop polling
      if (type === 'cards') setSyncingCards(false);
      else setSyncingSummaries(false);
      setToast({ type: 'error', message: 'Failed to start sync' });
    });

    startPolling(type);
  };

  /** Fire-and-forget bootstrap, then poll for progress */
  const handleBootstrap = () => {
    setBootstrapping(true);

    fetch('/api/admin/bootstrap-knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {
      setBootstrapping(false);
      setToast({ type: 'error', message: 'Failed to start bootstrap' });
    });

    startPolling('bootstrap');
  };

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const isAnySyncing = syncingCards || syncingSummaries || bootstrapping;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white dark:bg-dark-surface rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-body ${
          toast.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Description */}
      <p className="text-navy/60 dark:text-slate-400 font-body text-sm">
        AI Knowledge indexes all your cards and generates board summaries so the AI assistants can answer questions accurately.
        The cron runs every 2 hours for cards and every 6 hours for board summaries.
      </p>

      {/* Card Indexing Status */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg">
              Card Indexing
            </h2>
            {(syncingCards || bootstrapping) && <PulsingDot />}
          </div>
          <button
            onClick={() => handleSync('cards')}
            disabled={isAnySyncing}
            className="px-4 py-2 text-sm font-body font-medium rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncingCards ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Syncing...
              </span>
            ) : (
              'Force Sync Cards'
            )}
          </button>
        </div>

        {status && (
          <>
            {/* Coverage bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm font-body mb-1">
                <span className="text-navy/60 dark:text-slate-400">Coverage</span>
                <span className="text-navy dark:text-slate-200 font-medium">{status.cards.coverage}%</span>
              </div>
              <div className="h-3 bg-cream-dark dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-electric rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${status.cards.coverage}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <AnimatedStat label="Total Cards" value={status.cards.total} />
              <AnimatedStat label="Indexed" value={status.cards.indexed} color="text-emerald-600" />
              <AnimatedStat label="Pending" value={status.cards.pending} color="text-amber-600" />
              <AnimatedStat label="Errors" value={status.cards.errors} color="text-red-600" />
            </div>

            <div className="mt-3 text-xs text-navy/40 dark:text-slate-500 font-body">
              {status.embeddings.active.toLocaleString()} active embeddings
              {status.embeddings.last_indexed_at && (
                <> &middot; Last indexed {timeAgo(status.embeddings.last_indexed_at)}</>
              )}
            </div>
          </>
        )}
      </div>

      {/* Board Summaries */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg">
              Board Summaries
            </h2>
            {(syncingSummaries || bootstrapping) && <PulsingDot />}
          </div>
          <button
            onClick={() => handleSync('summaries')}
            disabled={isAnySyncing}
            className="px-4 py-2 text-sm font-body font-medium rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncingSummaries ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Generating...
              </span>
            ) : (
              'Regenerate All'
            )}
          </button>
        </div>

        {status && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <AnimatedStat label="Total Boards" value={status.board_summaries.total_boards} />
              <AnimatedStat label="Summarized" value={status.board_summaries.summarized} color="text-emerald-600" />
            </div>

            {status.board_summaries.details.length > 0 && (
              <div className="space-y-2">
                {status.board_summaries.details.map((bs) => (
                  <div
                    key={bs.board_id}
                    className="flex items-center justify-between py-2 px-3 bg-cream/50 dark:bg-slate-800/50 rounded-lg"
                  >
                    <div>
                      <span className="text-sm font-body font-medium text-navy dark:text-slate-200">
                        {bs.board_name}
                      </span>
                      {bs.themes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {bs.themes.slice(0, 4).map((t, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 bg-electric/10 text-electric rounded-full font-body"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-navy/40 dark:text-slate-500 font-body shrink-0 ml-2">
                      {timeAgo(bs.generated_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bootstrap Section */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg">
                Full Bootstrap
              </h2>
              {bootstrapping && <PulsingDot />}
            </div>
            <p className="text-navy/50 dark:text-slate-400 font-body text-sm mt-1">
              {bootstrapping
                ? 'Server is processing in the background. Numbers update every 3 seconds. Safe to navigate away.'
                : 'Run this once to index all existing cards. Processes as many as possible within 5 minutes.'}
            </p>
          </div>
          <button
            onClick={handleBootstrap}
            disabled={isAnySyncing}
            className="px-4 py-2 text-sm font-body font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {bootstrapping ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Running...
              </span>
            ) : (
              'Run Bootstrap'
            )}
          </button>
        </div>
      </div>

      {/* Error Details */}
      {status && status.error_cards.length > 0 && (
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-red-200 dark:border-red-900/50 p-6">
          <h2 className="text-red-700 dark:text-red-400 font-heading font-semibold text-lg mb-3">
            Indexing Errors ({status.error_cards.length})
          </h2>
          <div className="space-y-2">
            {status.error_cards.map((ec) => (
              <div
                key={ec.entity_id}
                className="py-2 px-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
              >
                <div className="text-xs font-mono text-red-600 dark:text-red-400">
                  Card: {ec.entity_id.slice(0, 8)}...
                </div>
                <div className="text-xs text-red-500 dark:text-red-300 mt-0.5">
                  {ec.error || 'Unknown error'}
                </div>
                <div className="text-xs text-red-400/60 mt-0.5">
                  {ec.last_attempt && timeAgo(ec.last_attempt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Animated stat that transitions when value changes */
function AnimatedStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className={`text-2xl font-heading font-bold tabular-nums transition-all duration-500 ${color || 'text-navy dark:text-slate-100'}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-navy/40 dark:text-slate-500 font-body">{label}</div>
    </div>
  );
}

/** Small green pulsing dot indicating active sync */
function PulsingDot() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
    </span>
  );
}

/** Spinner SVG */
function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
