'use client';

import { useState, useEffect, useCallback } from 'react';
import { CommentReaction } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import EmojiPicker from './EmojiPicker';

interface CommentReactionsProps {
  commentId: string;
  cardId: string;
  initialReactions?: CommentReaction[];
}

export default function CommentReactions({ commentId, cardId, initialReactions }: CommentReactionsProps) {
  const [reactions, setReactions] = useState<CommentReaction[]>(initialReactions || []);
  const [showPicker, setShowPicker] = useState(false);
  const { user } = useAuth();

  const fetchReactions = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/comments/${commentId}/reactions`);
      if (!res.ok) return;
      const json = await res.json();
      setReactions(json.data || []);
    } catch {
      // Silently fail
    }
  }, [cardId, commentId]);

  // Only fetch on mount if no initial data was provided
  useEffect(() => {
    if (!initialReactions) {
      fetchReactions();
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = async (emoji: string) => {
    if (!user) return;

    const existingReaction = reactions.find(
      (r) => r.emoji === emoji && r.user_id === user.id
    );

    try {
      if (existingReaction) {
        await fetch(
          `/api/cards/${cardId}/comments/${commentId}/reactions?reactionId=${existingReaction.id}`,
          { method: 'DELETE' }
        );
      } else {
        await fetch(`/api/cards/${cardId}/comments/${commentId}/reactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        });
      }
      fetchReactions();
    } catch {
      // Silently fail
    }

    setShowPicker(false);
  };

  // Group reactions by emoji
  const grouped = reactions.reduce<Record<string, CommentReaction[]>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {});

  const hasReactions = Object.keys(grouped).length > 0;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {Object.entries(grouped).map(([emoji, group]) => {
        const currentUserReacted = user
          ? group.some((r) => r.user_id === user.id)
          : false;
        const names = group
          .map((r) => r.profile?.display_name || 'User')
          .join(', ');

        return (
          <button
            key={emoji}
            onClick={() => handleSelect(emoji)}
            title={names}
            className={`
              inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-all
              ${currentUserReacted
                ? 'bg-electric/10 border border-electric'
                : 'bg-cream dark:bg-slate-800 border border-transparent hover:bg-cream-dark dark:hover:bg-slate-700'
              }
            `}
          >
            <span>{emoji}</span>
            <span className="font-body">{group.length}</span>
          </button>
        );
      })}

      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className={`
            inline-flex items-center justify-center rounded-full transition-all
            ${hasReactions
              ? 'w-6 h-6 text-navy/40 dark:text-slate-500 bg-cream dark:bg-slate-800 hover:bg-cream-dark dark:hover:bg-slate-700'
              : 'w-7 h-7 text-navy/30 dark:text-slate-600 hover:text-navy/50 dark:hover:text-slate-400 hover:bg-cream dark:hover:bg-slate-800'
            }
          `}
          title="React"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="1.5"/><path d="M8 14s1.5 2 4 2 4-2 4-2" strokeWidth="1.5" strokeLinecap="round"/><circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="1" fill="currentColor" stroke="none"/></svg>
        </button>
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1 z-50">
            <EmojiPicker
              onSelect={handleSelect}
              onClose={() => setShowPicker(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
