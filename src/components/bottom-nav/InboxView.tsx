'use client';

import { useMemo } from 'react';
import type { BoardWithLists, CardPlacementWithMeta } from '@/lib/types';

interface InboxViewProps {
  board: BoardWithLists;
  onCardClick: (cardId: string) => void;
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'urgent': return 'bg-red-500';
    case 'high': return 'bg-orange-500';
    case 'medium': return 'bg-yellow-500';
    case 'low': return 'bg-blue-400';
    default: return 'bg-slate-300 dark:bg-slate-600';
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default function InboxView({ board, onCardClick }: InboxViewProps) {
  // Get all cards with no assignees (unassigned/inbox items), sorted by creation date desc
  const inboxCards = useMemo(() => {
    const cards: (CardPlacementWithMeta & { listName: string })[] = [];
    for (const list of board.lists) {
      for (const card of list.cards) {
        if (!card.assignees || card.assignees.length === 0) {
          cards.push({ ...card, listName: list.name });
        }
      }
    }
    return cards.sort((a, b) =>
      new Date(b.card?.created_at || b.created_at).getTime() -
      new Date(a.card?.created_at || a.created_at).getTime()
    );
  }, [board]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 pb-24">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-electric/10 dark:bg-electric/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold font-headline text-navy dark:text-white">Inbox</h2>
            <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
              {inboxCards.length} unassigned {inboxCards.length === 1 ? 'item' : 'items'}
            </p>
          </div>
        </div>

        {inboxCards.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-navy/60 dark:text-slate-400 font-body text-sm">All items are assigned. Inbox is clear!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {inboxCards.map((card) => (
              <button
                key={card.id}
                onClick={() => onCardClick(card.card_id)}
                className="w-full text-left p-4 bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 rounded-xl hover:border-electric/40 dark:hover:border-electric/40 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start gap-3">
                  {/* Priority dot */}
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${getPriorityColor(card.card?.priority || 'none')}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-navy dark:text-white truncate group-hover:text-electric transition-colors">
                        {card.card?.title || 'Untitled'}
                      </h3>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-navy/40 dark:text-slate-500 font-body">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-cream-dark/50 dark:bg-slate-800 rounded-md">
                        {card.listName}
                      </span>
                      <span>{timeAgo(card.card?.created_at || card.created_at)}</span>
                      {card.comment_count ? (
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          {card.comment_count}
                        </span>
                      ) : null}
                      {card.attachment_count ? (
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {card.attachment_count}
                        </span>
                      ) : null}
                    </div>

                    {/* Labels */}
                    {card.labels && card.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {card.labels.slice(0, 3).map((label) => (
                          <span
                            key={label.id}
                            className="px-2 py-0.5 text-xs rounded-full text-white font-body"
                            style={{ backgroundColor: label.color }}
                          >
                            {label.name}
                          </span>
                        ))}
                        {card.labels.length > 3 && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-200 dark:bg-slate-700 text-navy/50 dark:text-slate-400">
                            +{card.labels.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Due date badge */}
                  {card.card?.due_date && (
                    <span className={`text-xs px-2 py-1 rounded-lg font-body flex-shrink-0 ${
                      new Date(card.card.due_date) < new Date()
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-cream-dark/50 dark:bg-slate-800 text-navy/50 dark:text-slate-400'
                    }`}>
                      {new Date(card.card.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
