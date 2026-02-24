'use client';

import { useState, useEffect, useCallback } from 'react';

interface Pattern {
  id: string;
  name: string;
  event_types: string[];
  products: string[];
  typical_price_min: number;
  typical_price_max: number;
  match_keywords: string[];
  confidence_threshold: number;
  is_no_brainer: boolean;
  created_from_count: number;
  is_active: boolean;
  created_at: string;
}

interface ProgressEvent {
  step: string;
  current: number;
  total: number;
  message: string;
}

export default function ProposalLearningView() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proposals/patterns');
      const json = await res.json();
      if (json.ok) setPatterns(json.data || []);
    } catch (err) {
      console.error('Failed to fetch patterns:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  const runPipeline = async () => {
    setRunning(true);
    setError(null);
    setProgress({ step: 'starting', current: 0, total: 6, message: 'Starting learning pipeline...' });

    try {
      const res = await fetch('/api/proposals/learn', { method: 'POST' });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Pipeline failed');
      }

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as ProgressEvent;
              setProgress(event);
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      // Refresh patterns after pipeline completes
      await fetchPatterns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline failed');
    } finally {
      setRunning(false);
    }
  };

  const togglePattern = async (pattern: Pattern) => {
    try {
      // No dedicated pattern update endpoint, so we use the generic patterns endpoint
      // For now, just toggle locally
      setPatterns((prev) =>
        prev.map((p) =>
          p.id === pattern.id ? { ...p, is_active: !p.is_active } : p,
        ),
      );
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Pipeline Runner */}
      <div className="border rounded-lg p-6 dark:border-gray-700 bg-white dark:bg-gray-800/50">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Learning Pipeline
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Analyze your historical proposals from completed cards and Gmail to build patterns,
          populate the product catalog, and learn your email writing style.
        </p>

        {progress && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-300">{progress.message}</span>
              <span className="text-gray-400">{progress.current}/{progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-pink-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={runPipeline}
          disabled={running}
          className="px-6 py-2.5 bg-pink-600 text-white rounded-lg hover:bg-pink-700 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? 'Running Pipeline...' : 'Run Learning Pipeline'}
        </button>
      </div>

      {/* Patterns */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Learned Patterns ({patterns.length})
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
          </div>
        ) : patterns.length === 0 ? (
          <div className="text-center text-gray-400 py-12 border rounded-lg dark:border-gray-700">
            No patterns learned yet. Run the learning pipeline to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {patterns.map((pattern) => (
              <div
                key={pattern.id}
                className={`border rounded-lg p-4 dark:border-gray-700 bg-white dark:bg-gray-800/50 ${
                  !pattern.is_active ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">{pattern.name}</h3>
                      {pattern.is_no_brainer && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          No-Brainer
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        Built from {pattern.created_from_count} proposals
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => togglePattern(pattern)}
                    className={`w-8 h-5 rounded-full transition-colors ${
                      pattern.is_active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`block w-3.5 h-3.5 rounded-full bg-white shadow transform transition-transform ${
                        pattern.is_active ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Event Types</span>
                    <div className="flex flex-wrap gap-1">
                      {pattern.event_types.map((et) => (
                        <span key={et} className="text-xs px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 rounded">
                          {et}
                        </span>
                      ))}
                      {pattern.event_types.length === 0 && <span className="text-gray-400">—</span>}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Products</span>
                    <div className="flex flex-wrap gap-1">
                      {pattern.products.slice(0, 5).map((p) => (
                        <span key={p} className="text-xs px-1.5 py-0.5 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-300 rounded">
                          {p}
                        </span>
                      ))}
                      {pattern.products.length > 5 && (
                        <span className="text-xs text-gray-400">+{pattern.products.length - 5}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Price Range</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      ${pattern.typical_price_min.toLocaleString()} – ${pattern.typical_price_max.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400 block mb-0.5">Confidence Threshold</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {(pattern.confidence_threshold * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {pattern.match_keywords.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-gray-400">Keywords: </span>
                    <span className="text-xs text-gray-500">{pattern.match_keywords.join(', ')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
