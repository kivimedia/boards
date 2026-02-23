'use client';

import { useState } from 'react';
import type { MultiBrowserResult } from '@/lib/types';

interface Props {
  results: MultiBrowserResult[];
}

const BROWSER_ICONS: Record<string, string> = {
  chrome: '🌐',
  firefox: '🦊',
  webkit: '🧭',
};

function diffSeverityColor(percentage: number): string {
  if (percentage === 0) return 'text-green-600 dark:text-green-400';
  if (percentage < 5) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function diffSeverityBg(percentage: number): string {
  if (percentage === 0) return 'bg-green-100 dark:bg-green-900/30';
  if (percentage < 5) return 'bg-yellow-100 dark:bg-yellow-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

export default function MultiBrowserResults({ results }: Props) {
  const [selectedBrowser, setSelectedBrowser] = useState<string>(results[0]?.browser ?? 'chrome');

  const chromeResult = results.find((r) => r.browser === 'chrome');
  const selectedResult = results.find((r) => r.browser === selectedBrowser);

  if (results.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
        No multi-browser results available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Browser Tabs */}
      <div className="flex gap-2">
        {results.map((r) => (
          <button
            key={r.browser}
            onClick={() => setSelectedBrowser(r.browser)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedBrowser === r.browser
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-2 border-blue-500'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750'
            }`}
          >
            <span>{BROWSER_ICONS[r.browser] ?? '🌐'}</span>
            <span className="capitalize">{r.browser}</span>
          </button>
        ))}
      </div>

      {/* Lighthouse Scores Comparison */}
      {chromeResult?.lighthouseScores && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Lighthouse Scores (Chrome only)
          </h4>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(chromeResult.lighthouseScores).map(([key, value]) => (
              <div key={key} className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {key === 'bestPractices' ? 'Best Practices' : key}
                </p>
                <p className="text-2xl font-bold" style={{ color: value >= 90 ? '#22c55e' : value >= 70 ? '#eab308' : '#ef4444' }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-Browser Differences */}
      {selectedResult && selectedResult.browser !== 'chrome' && selectedResult.differences.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Differences vs Chrome
            </h4>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[400px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Viewport</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Difference</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {selectedResult.differences.map((diff) => (
                <tr key={diff.viewport} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2 capitalize text-gray-900 dark:text-white">
                    {diff.viewport}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${diffSeverityBg(diff.diffPercentage)} ${diffSeverityColor(diff.diffPercentage)}`}>
                      {diff.diffPercentage}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-400 text-xs">
                    {diff.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Screenshot Grid */}
      {selectedResult && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Screenshots - {selectedResult.browser}
          </h4>
          <div className="grid grid-cols-3 gap-3">
            {selectedResult.screenshots.map((ss) => (
              <div key={ss.viewport} className="text-center">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-md aspect-[9/16] flex items-center justify-center">
                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                    {ss.viewport}
                    <br />
                    {ss.width}x{ss.height}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 capitalize">{ss.viewport}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
