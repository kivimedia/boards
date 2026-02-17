'use client';

import { useState } from 'react';
import type { ChatSession, ChatScope } from '@/lib/types';

interface ChatHistoryProps {
  sessions: ChatSession[];
  onSelect: (session: ChatSession) => void;
  onDelete: (sessionId: string) => void;
}

function getScopeBadge(scope: ChatScope): { label: string; color: string } {
  switch (scope) {
    case 'ticket':
      return { label: 'Ticket', color: 'bg-purple-100 text-purple-700' };
    case 'board':
      return { label: 'Board', color: 'bg-blue-100 text-blue-700' };
    case 'all_boards':
      return { label: 'All Boards', color: 'bg-green-100 text-green-700' };
    default:
      return { label: scope, color: 'bg-cream-dark dark:bg-slate-800 text-navy/60 dark:text-slate-400' };
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export default function ChatHistory({ sessions, onSelect, onDelete }: ChatHistoryProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    try {
      onDelete(sessionId);
    } finally {
      setDeletingId(null);
    }
  };

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4">
        <div className="w-10 h-10 rounded-xl bg-cream-dark dark:bg-slate-800 flex items-center justify-center mb-3">
          <svg
            className="w-5 h-5 text-navy/25 dark:text-slate-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </div>
        <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No previous conversations</p>
        <p className="text-xs text-navy/25 dark:text-slate-600 font-body mt-1">Start a new chat to get going</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-cream-dark/50 dark:divide-slate-700/50">
      {sessions.map((session) => {
        const badge = getScopeBadge(session.scope);
        const isDeleting = deletingId === session.id;

        return (
          <button
            key={session.id}
            onClick={() => onSelect(session)}
            disabled={isDeleting}
            className="
              w-full text-left px-4 py-3 flex items-start gap-3
              hover:bg-cream-dark/40 dark:hover:bg-slate-800/40 transition-colors duration-150
              disabled:opacity-50
            "
          >
            {/* Chat icon */}
            <div className="w-8 h-8 rounded-lg bg-cream-dark dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
              <svg
                className="w-4 h-4 text-navy/40 dark:text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-navy dark:text-slate-100 truncate font-body">
                  {session.title || 'Untitled conversation'}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-1">
                {/* Scope badge */}
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.color}`}>
                  {badge.label}
                </span>
                {/* Message count */}
                <span className="text-[10px] text-navy/30 dark:text-slate-500 font-body">
                  {session.message_count} message{session.message_count !== 1 ? 's' : ''}
                </span>
                {/* Date */}
                <span className="text-[10px] text-navy/25 dark:text-slate-600 font-body">
                  {formatDate(session.updated_at)}
                </span>
              </div>
            </div>

            {/* Delete button */}
            <button
              onClick={(e) => handleDelete(e, session.id)}
              disabled={isDeleting}
              className="
                shrink-0 p-1.5 rounded-lg text-navy/20 dark:text-slate-600
                hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all duration-200
                opacity-0 group-hover:opacity-100
              "
              style={{ opacity: 1 }}
              title="Delete conversation"
            >
              {isDeleting ? (
                <svg
                  className="animate-spin w-3.5 h-3.5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          </button>
        );
      })}
    </div>
  );
}
