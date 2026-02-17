'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { CardWatcher } from '@/lib/types';

interface CardWatchButtonProps {
  cardId: string;
}

export default function CardWatchButton({ cardId }: CardWatchButtonProps) {
  const [isWatching, setIsWatching] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const fetchWatchers = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/cards/${cardId}/watchers`);
      if (!res.ok) return;
      const json = await res.json();
      const watchers: CardWatcher[] = json.data || [];
      setIsWatching(watchers.some((w) => w.user_id === user.id));
    } catch {
      // Silently fail
    }
  }, [cardId, user]);

  useEffect(() => {
    fetchWatchers();
  }, [fetchWatchers]);

  const toggleWatch = async () => {
    if (!user || loading) return;
    setLoading(true);

    try {
      if (isWatching) {
        await fetch(`/api/cards/${cardId}/watchers`, { method: 'DELETE' });
      } else {
        await fetch(`/api/cards/${cardId}/watchers`, { method: 'POST' });
      }
      setIsWatching(!isWatching);
    } catch {
      // Silently fail
    }

    setLoading(false);
  };

  return (
    <button
      onClick={toggleWatch}
      disabled={loading}
      title={isWatching ? 'Stop watching - you will no longer get notifications for this card' : 'Watch this card - get notified about updates'}
      className={`
        shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
        ${isWatching
          ? 'bg-electric/10 text-electric hover:bg-electric/20'
          : 'text-navy/50 dark:text-slate-400 hover:text-navy/70 dark:hover:text-slate-300 bg-cream dark:bg-navy hover:bg-cream-dark dark:hover:bg-slate-800 border border-cream-dark dark:border-slate-700'
        }
        ${loading ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <svg
        className="w-3.5 h-3.5"
        fill={isWatching ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={isWatching ? 0 : 2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
      <span className="font-body">{isWatching ? 'Watching' : 'Watch'}</span>
    </button>
  );
}
