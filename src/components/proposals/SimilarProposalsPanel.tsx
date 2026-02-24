'use client';

import { useState, useEffect } from 'react';

interface SimilarDraft {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
  card: {
    title: string;
    event_type: string | null;
  } | null;
}

interface Props {
  patternId: string;
  currentId: string;
}

export default function SimilarProposalsPanel({ patternId, currentId }: Props) {
  const [similar, setSimilar] = useState<SimilarDraft[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSimilar() {
      try {
        const res = await fetch(`/api/proposals/queue?limit=10`);
        const json = await res.json();
        if (json.ok) {
          // Filter to same pattern, exclude current
          const filtered = (json.data || []).filter(
            (d: { pattern_id: string | null; id: string }) =>
              d.pattern_id === patternId && d.id !== currentId,
          );
          setSimilar(filtered);
        }
      } catch (err) {
        console.error('Failed to fetch similar proposals:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSimilar();
  }, [patternId, currentId]);

  if (loading) {
    return (
      <div className="mt-3 text-sm text-gray-400">Loading similar proposals...</div>
    );
  }

  if (similar.length === 0) {
    return (
      <div className="mt-3 text-sm text-gray-400">No similar proposals found.</div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {similar.map((draft) => (
        <div
          key={draft.id}
          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-sm"
        >
          <div>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {draft.card?.title || 'Unknown'}
            </span>
            {draft.card?.event_type && (
              <span className="ml-2 text-gray-400">{draft.card.event_type}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              ${draft.total_amount?.toLocaleString() || '0'}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                draft.status === 'approved'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                  : draft.status === 'rejected'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {draft.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
