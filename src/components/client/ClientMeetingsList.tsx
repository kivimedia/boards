'use client';

import { useState, useEffect, useCallback } from 'react';

interface ActionItem {
  text: string;
  assignee?: string;
  due_date?: string;
  priority?: string;
}

interface Meeting {
  id: string;
  title: string | null;
  meeting_title: string | null;
  share_url: string | null;
  duration_seconds: number | null;
  recorded_at: string;
  ai_summary: string | null;
  ai_action_items: ActionItem[] | null;
}

interface ClientMeetingsListProps {
  clientId: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ClientMeetingsList({ clientId }: ClientMeetingsListProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        client_id: clientId,
        limit: '20',
        page: String(page),
      });
      const res = await fetch(`/api/meetings?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
        setTotalPages(data.total_pages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId, page]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow-sm border border-cream-dark p-5 animate-pulse"
          >
            <div className="h-5 bg-cream-dark/40 rounded w-2/3 mb-3" />
            <div className="h-4 bg-cream-dark/30 rounded w-1/3 mb-4" />
            <div className="h-16 bg-cream-dark/20 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (meetings.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-cream-dark p-8 text-center">
        <svg
          className="w-12 h-12 text-navy/20 mx-auto mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <p className="text-navy/50 font-body text-sm">
          No meeting recordings found for this account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {meetings.map((m) => {
        const title = m.title || m.meeting_title || 'Untitled Meeting';
        const actionItems = m.ai_action_items || [];

        return (
          <div
            key={m.id}
            className="bg-white rounded-lg shadow-sm border border-cream-dark overflow-hidden"
          >
            <div className="p-5">
              {/* Title + date row */}
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-navy font-heading font-semibold text-base truncate">
                    {title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-navy/50 font-body">
                    <span>{formatDate(m.recorded_at)}</span>
                    {m.duration_seconds && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatDuration(m.duration_seconds)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Watch Recording link */}
                {m.share_url && (
                  <a
                    href={m.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-3 flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-electric/10 text-electric rounded-lg text-xs font-medium hover:bg-electric/20 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Watch Recording
                  </a>
                )}
              </div>

              {/* AI Summary */}
              {m.ai_summary && (
                <div className="mt-3 bg-cream/50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-navy/40 uppercase tracking-wider mb-1.5 font-heading">
                    Summary
                  </h4>
                  <p className="text-sm text-navy/70 font-body whitespace-pre-wrap leading-relaxed">
                    {m.ai_summary}
                  </p>
                </div>
              )}

              {/* AI Action Items */}
              {actionItems.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold text-navy/40 uppercase tracking-wider mb-1.5 font-heading">
                    Action Items
                  </h4>
                  <ul className="space-y-1.5">
                    {actionItems.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-navy/70 font-body"
                      >
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-electric flex-shrink-0" />
                        <span>
                          {item.text}
                          {item.assignee && (
                            <span className="text-navy/40 ml-1">({item.assignee})</span>
                          )}
                          {item.due_date && (
                            <span className="text-navy/40 ml-1">- Due: {item.due_date}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-cream-dark text-navy/60 hover:bg-cream disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-body"
          >
            Previous
          </button>
          <span className="text-sm text-navy/40 font-body">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-cream-dark text-navy/60 hover:bg-cream disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-body"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
