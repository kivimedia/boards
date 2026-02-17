'use client';

import { useState, useEffect, useCallback } from 'react';
import { CommentReaction } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import EmojiPicker from './EmojiPicker';

interface CommentReactionsProps {
  commentId: string;
  cardId: string;
}

export default function CommentReactions({ commentId, cardId }: CommentReactionsProps) {
  const [reactions, setReactions] = useState<CommentReaction[]>([]);
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

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

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

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
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
                : 'bg-cream dark:bg-slate-800 border border-transparent'
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
          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-cream dark:bg-slate-800 text-navy/40 dark:text-slate-500 hover:bg-cream-dark dark:hover:bg-slate-700 hover:text-navy/60 dark:hover:text-slate-300 text-xs transition-all"
          title="Add reaction"
        >
          +
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
