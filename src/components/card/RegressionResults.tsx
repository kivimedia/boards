'use client';

import { useState } from 'react';

interface RegressionResult {
  viewport: string;
  baselinePath: string;
  currentPath: string;
  diffPath: string | null;
  mismatchPercentage: number;
  flagged: boolean;
}

interface RegressionResultsProps {
  results: RegressionResult[];
  hasRegression: boolean;
  summary: string;
  storageBaseUrl: string;
  onSetBaseline?: () => void;
}

export default function RegressionResults({
  results,
  hasRegression,
  summary,
  storageBaseUrl,
  onSetBaseline,
}: RegressionResultsProps) {
  const [expandedViewport, setExpandedViewport] = useState<string | null>(null);

  if (results.length === 0) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 py-2">{summary}</div>
    );
  }

  const getUrl = (path: string) => `${storageBaseUrl}/${path}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-navy dark:text-white">Visual Regression</span>
          {hasRegression ? (
            <span className="px-1.5 py-0.5 bg-danger/20 text-danger text-xs rounded font-medium">Changes Detected</span>
          ) : (
            <span className="px-1.5 py-0.5 bg-success/20 text-success text-xs rounded font-medium">No Regression</span>
          )}
        </div>
        {onSetBaseline && (
          <button
            onClick={onSetBaseline}
            className="text-xs text-electric hover:underline"
          >
            Accept as new baseline
          </button>
        )}
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">{summary}</p>

      <div className="space-y-2">
        {results.map((r) => (
          <div key={r.viewport} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedViewport(expandedViewport === r.viewport ? null : r.viewport)}
              className="w-full flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-navy-light transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-navy dark:text-white capitalize">{r.viewport}</span>
                <span className={`text-xs font-bold ${r.flagged ? 'text-danger' : 'text-success'}`}>
                  {r.mismatchPercentage}% change
                </span>
              </div>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedViewport === r.viewport ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedViewport === r.viewport && (
              <div className="p-3 border-t border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Baseline</p>
                    <img src={getUrl(r.baselinePath)} alt="Baseline" className="w-full rounded border border-slate-200 dark:border-slate-700" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Current</p>
                    <img src={getUrl(r.currentPath)} alt="Current" className="w-full rounded border border-slate-200 dark:border-slate-700" />
                  </div>
                  {r.diffPath && (
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Diff</p>
                      <img src={getUrl(r.diffPath)} alt="Diff" className="w-full rounded border border-slate-200 dark:border-slate-700" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
