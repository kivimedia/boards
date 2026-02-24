'use client';

import { useEffect, useState } from 'react';

interface RevisionEntry {
  card_id: string;
  card_title: string;
  ping_pong_count: number;
  total_revision_time_minutes: number;
  is_outlier: boolean;
  outlier_reason: string | null;
  assignee_name: string | null;
  client_name: string | null;
}

interface RevisionDeepDiveProps {
  boardId: string;
  startDate?: string;
  endDate?: string;
}

type PatternCategory = 'Unclear brief' | 'Client indecisiveness' | 'Skill gap' | 'Scope creep' | 'Normal';

function categorizePattern(entry: RevisionEntry): PatternCategory {
  // Heuristics for categorizing revision patterns
  if (entry.ping_pong_count >= 5) return 'Client indecisiveness';
  if (entry.ping_pong_count >= 3 && entry.total_revision_time_minutes < 60) return 'Unclear brief';
  if (entry.ping_pong_count >= 3 && entry.total_revision_time_minutes > 240) return 'Scope creep';
  if (entry.is_outlier) return 'Skill gap';
  return 'Normal';
}

const patternColors: Record<PatternCategory, string> = {
  'Unclear brief': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  'Client indecisiveness': 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  'Skill gap': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  'Scope creep': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  'Normal': 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
};

export default function RevisionDeepDive({ boardId, startDate, endDate }: RevisionDeepDiveProps) {
  const [entries, setEntries] = useState<RevisionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'outliers'>('outliers');

  useEffect(() => {
    fetchRevisionData();
  }, [boardId, startDate, endDate, filter]);

  const fetchRevisionData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ board_id: boardId });
      if (filter === 'outliers') params.set('outliers_only', 'true');
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const res = await fetch(`/api/boards/${boardId}/revision-analysis?${params}`);
      if (!res.ok) return;
      const json = await res.json();

      // Map response to entries with card titles
      const cards = json.data?.cards ?? [];
      setEntries(
        cards.map((c: any) => ({
          card_id: c.card_id,
          card_title: c.card_title ?? c.card_id,
          ping_pong_count: c.ping_pong_count,
          total_revision_time_minutes: c.total_revision_time_minutes,
          is_outlier: c.is_outlier,
          outlier_reason: c.outlier_reason,
          assignee_name: c.assignee_name ?? null,
          client_name: c.client_name ?? null,
        }))
      );
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Revision Deep Dive
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setFilter('outliers')}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              filter === 'outliers'
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Outliers
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              filter === 'all'
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
          No revision data found {filter === 'outliers' ? '(no outliers detected)' : ''}
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {entries.map((entry) => {
            const pattern = categorizePattern(entry);
            return (
              <div key={entry.card_id} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {entry.card_title}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {entry.ping_pong_count} revisions
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTime(entry.total_revision_time_minutes)} in revision
                    </span>
                    {entry.assignee_name && (
                      <>
                        <span className="text-xs text-gray-400 dark:text-gray-500">-</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {entry.assignee_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${patternColors[pattern]}`}>
                  {pattern}
                </span>
                {entry.is_outlier && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 whitespace-nowrap">
                    Outlier
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
