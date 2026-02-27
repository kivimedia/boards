'use client';

import { useState, useEffect, useCallback } from 'react';

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

interface BootstrapResult {
  message: string;
  total_cards: number;
  indexed_this_batch: number;
  skipped: number;
  errors: number;
  remaining: number;
  summaries_generated: number;
  duration_ms: number;
}

export default function AIKnowledgeStatus() {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapLog, setBootstrapLog] = useState<string[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/knowledge-status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleSync = async (type: 'cards' | 'summaries' | 'all') => {
    setSyncing(type);
    try {
      const res = await fetch('/api/settings/knowledge-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.ok) {
        setToast({
          type: 'success',
          message: `Sync complete: ${data.cards?.embedded || 0} cards indexed, ${data.summaries?.generated || 0} summaries generated`,
        });
        fetchStatus();
      } else {
        setToast({ type: 'error', message: data.error || 'Sync failed' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Sync failed' });
    } finally {
      setSyncing(null);
    }
  };

  const handleBootstrap = async () => {
    setBootstrapping(true);
    setBootstrapLog(['Starting bootstrap...']);

    let remaining = Infinity;
    let totalIndexed = 0;
    let batch = 0;

    while (remaining > 0) {
      batch++;
      setBootstrapLog((prev) => [...prev, `Batch ${batch}: processing...`]);

      try {
        const res = await fetch('/api/admin/bootstrap-knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: 25 }),
        });

        const data: BootstrapResult = await res.json();

        if (!res.ok) {
          setBootstrapLog((prev) => [...prev, `Batch ${batch}: ERROR - ${(data as any).error}`]);
          break;
        }

        totalIndexed += data.indexed_this_batch;
        remaining = data.remaining;

        setBootstrapLog((prev) => [
          ...prev,
          `Batch ${batch}: ${data.indexed_this_batch} indexed, ${data.skipped} skipped, ${data.remaining} remaining (${data.duration_ms}ms)`,
        ]);

        if (data.summaries_generated > 0) {
          setBootstrapLog((prev) => [
            ...prev,
            `Generated ${data.summaries_generated} board summaries`,
          ]);
        }
      } catch (err: any) {
        setBootstrapLog((prev) => [...prev, `Batch ${batch}: FAILED - ${err.message}`]);
        break;
      }
    }

    setBootstrapLog((prev) => [...prev, `Done! Total indexed: ${totalIndexed}`]);
    setBootstrapping(false);
    fetchStatus();
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
          <h2 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg">
            Card Indexing
          </h2>
          <button
            onClick={() => handleSync('cards')}
            disabled={syncing !== null}
            className="px-4 py-2 text-sm font-body font-medium rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing === 'cards' || syncing === 'all' ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
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
                  className="h-full bg-electric rounded-full transition-all duration-500"
                  style={{ width: `${status.cards.coverage}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Total Cards" value={status.cards.total} />
              <Stat label="Indexed" value={status.cards.indexed} color="text-emerald-600" />
              <Stat label="Pending" value={status.cards.pending} color="text-amber-600" />
              <Stat label="Errors" value={status.cards.errors} color="text-red-600" />
            </div>

            <div className="mt-3 text-xs text-navy/40 dark:text-slate-500 font-body">
              {status.embeddings.active} active embeddings
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
          <h2 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg">
            Board Summaries
          </h2>
          <button
            onClick={() => handleSync('summaries')}
            disabled={syncing !== null}
            className="px-4 py-2 text-sm font-body font-medium rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing === 'summaries' ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
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
              <Stat label="Total Boards" value={status.board_summaries.total_boards} />
              <Stat label="Summarized" value={status.board_summaries.summarized} color="text-emerald-600" />
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
            <h2 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg">
              Full Bootstrap
            </h2>
            <p className="text-navy/50 dark:text-slate-400 font-body text-sm mt-1">
              Run this once to index all existing cards. Processes 25 cards per batch and auto-continues until done.
            </p>
          </div>
          <button
            onClick={handleBootstrap}
            disabled={bootstrapping || syncing !== null}
            className="px-4 py-2 text-sm font-body font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {bootstrapping ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running...
              </span>
            ) : (
              'Run Bootstrap'
            )}
          </button>
        </div>

        {bootstrapLog.length > 0 && (
          <div className="mt-4 bg-navy/5 dark:bg-slate-800 rounded-lg p-3 max-h-60 overflow-y-auto font-mono text-xs text-navy/70 dark:text-slate-300 space-y-1">
            {bootstrapLog.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
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

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className={`text-2xl font-heading font-bold ${color || 'text-navy dark:text-slate-100'}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-navy/40 dark:text-slate-500 font-body">{label}</div>
    </div>
  );
}
