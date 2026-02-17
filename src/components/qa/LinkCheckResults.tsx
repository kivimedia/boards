'use client';

import { useState, useMemo } from 'react';
import type { QALinkCheck } from '@/lib/types';

interface Props {
  links: QALinkCheck[];
}

type FilterType = 'all' | 'broken' | 'slow' | 'redirects' | 'healthy';

const FILTER_LABELS: Record<FilterType, string> = {
  all: 'All',
  broken: 'Broken',
  slow: 'Slow (>3s)',
  redirects: 'Redirects',
  healthy: 'Healthy',
};

const SLOW_THRESHOLD = 3000;

function statusBadge(statusCode: number | null, isBroken: boolean): { text: string; className: string } {
  if (isBroken) {
    return {
      text: statusCode ? `${statusCode}` : 'Error',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    };
  }
  if (statusCode && statusCode >= 300 && statusCode < 400) {
    return {
      text: `${statusCode}`,
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    };
  }
  return {
    text: statusCode ? `${statusCode}` : 'OK',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  };
}

function linkTypeBadge(type: string): string {
  switch (type) {
    case 'internal': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
    case 'external': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300';
    case 'anchor': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    case 'mailto': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300';
    case 'tel': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

export default function LinkCheckResults({ links }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [showAll, setShowAll] = useState(false);

  const counts = useMemo(() => ({
    all: links.length,
    broken: links.filter((l) => l.is_broken).length,
    slow: links.filter((l) => !l.is_broken && (l.response_time_ms ?? 0) > SLOW_THRESHOLD).length,
    redirects: links.filter((l) => l.status_code !== null && l.status_code >= 300 && l.status_code < 400).length,
    healthy: links.filter((l) => !l.is_broken && l.status_code !== null && l.status_code < 300).length,
  }), [links]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'broken': return links.filter((l) => l.is_broken);
      case 'slow': return links.filter((l) => !l.is_broken && (l.response_time_ms ?? 0) > SLOW_THRESHOLD);
      case 'redirects': return links.filter((l) => l.status_code !== null && l.status_code >= 300 && l.status_code < 400);
      case 'healthy': return links.filter((l) => !l.is_broken && l.status_code !== null && l.status_code < 300);
      default: return links;
    }
  }, [links, filter]);

  const displayed = showAll ? filtered : filtered.slice(0, 20);

  if (links.length === 0) {
    return (
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
        No link check results available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Bar */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
        <div className="text-sm">
          <span className="font-semibold text-gray-900 dark:text-white">{links.length}</span>
          <span className="text-gray-500 dark:text-gray-400"> links checked</span>
        </div>
        {counts.broken > 0 && (
          <div className="text-sm text-red-600 dark:text-red-400 font-medium">
            {counts.broken} broken
          </div>
        )}
        {counts.slow > 0 && (
          <div className="text-sm text-yellow-600 dark:text-yellow-400">
            {counts.slow} slow
          </div>
        )}
        {counts.redirects > 0 && (
          <div className="text-sm text-orange-600 dark:text-orange-400">
            {counts.redirects} redirects
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1">
        {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setShowAll(false); }}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {FILTER_LABELS[f]} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Links Table */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">URL</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Type</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Time</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((link) => {
              const badge = statusBadge(link.status_code, link.is_broken);
              const isSlow = !link.is_broken && (link.response_time_ms ?? 0) > SLOW_THRESHOLD;

              return (
                <tr key={link.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-3 py-2 max-w-xs truncate">
                    <span className="text-gray-900 dark:text-white text-xs font-mono">
                      {link.url.replace(/^https?:\/\//, '').slice(0, 60)}
                    </span>
                    {link.error_message && (
                      <p className="text-xs text-red-500 mt-0.5">{link.error_message}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                      {badge.text}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${linkTypeBadge(link.link_type)}`}>
                      {link.link_type}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-right text-xs ${isSlow ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                    {link.response_time_ms != null ? `${link.response_time_ms}ms` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Show More */}
      {!showAll && filtered.length > 20 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full text-center text-sm text-blue-600 dark:text-blue-400 hover:underline py-2"
        >
          Show all {filtered.length} links
        </button>
      )}
    </div>
  );
}
