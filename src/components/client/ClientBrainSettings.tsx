'use client';

import { useState, useCallback } from 'react';
import ClientBrainPanel from './ClientBrainPanel';

interface ClientBrainSettingsProps {
  clientId: string;
  clientName: string;
}

export default function ClientBrainSettings({ clientId, clientName }: ClientBrainSettingsProps) {
  const [indexingMap, setIndexingMap] = useState(false);
  const [indexingMapResult, setIndexingMapResult] = useState<string | null>(null);
  const [indexingMapError, setIndexingMapError] = useState<string | null>(null);

  const handleIndexMapBoard = useCallback(async () => {
    setIndexingMap(true);
    setIndexingMapResult(null);
    setIndexingMapError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/brain/index-map`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to index map board');
      }

      const data = await res.json();
      const result = data.data;
      setIndexingMapResult(
        `Indexed ${result.indexed} documents with ${result.errors} errors`
      );
    } catch (err) {
      setIndexingMapError(err instanceof Error ? err.message : 'Failed to index');
    } finally {
      setIndexingMap(false);
    }
  }, [clientId]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <span className="text-lg">🧠</span>
          </div>
          <div>
            <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100">
              Client Brain — {clientName}
            </h2>
            <p className="text-sm text-navy/50 dark:text-slate-400 font-body">
              AI knowledge base powered by RAG. Index client data for intelligent queries.
            </p>
          </div>
        </div>
      </div>

      {/* Re-indexing Controls */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <h3 className="text-sm font-heading font-semibold text-navy dark:text-slate-100 mb-4">
          Re-index Data Sources
        </h3>
        <p className="text-xs text-navy/50 dark:text-slate-400 font-body mb-4">
          Manually re-index client data into the brain. This updates the AI knowledge base with the latest doors, keys, training, and map sections.
        </p>

        <div className="space-y-3">
          {/* Map Board indexing */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700">
            <div>
              <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">Map Board</p>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">Doors, keys, training, sections</p>
            </div>
            <button
              onClick={handleIndexMapBoard}
              disabled={indexingMap}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-electric text-white hover:bg-electric-bright disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {indexingMap ? (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Indexing...
                </span>
              ) : (
                'Re-index'
              )}
            </button>
          </div>

          {/* Map Board result */}
          {indexingMapResult && (
            <div className="px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30">
              <p className="text-xs text-green-700 dark:text-green-300 font-body">{indexingMapResult}</p>
            </div>
          )}
          {indexingMapError && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30">
              <p className="text-xs text-red-700 dark:text-red-300 font-body">{indexingMapError}</p>
            </div>
          )}
        </div>
      </div>

      {/* Brain Panel — Query + Documents */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <h3 className="text-sm font-heading font-semibold text-navy dark:text-slate-100 mb-4">
          Query & Documents
        </h3>
        <ClientBrainPanel clientId={clientId} />
      </div>
    </div>
  );
}
