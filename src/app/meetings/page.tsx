'use client';

import { useState, useEffect, useCallback } from 'react';

interface Meeting {
  id: string;
  fathom_recording_id: number;
  title: string | null;
  meeting_title: string | null;
  share_url: string | null;
  fathom_url: string | null;
  duration_seconds: number | null;
  recorded_at: string;
  fathom_summary: string | null;
  fathom_action_items: any[] | null;
  processing_status: string;
  matched_client_id: string | null;
  matched_by: string | null;
  calendar_invitees: any[] | null;
  clients: { id: string; name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  matched: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  needs_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/meetings?${params}`);
      const data = await res.json();
      setMeetings(data.meetings || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const runBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch('/api/admin/fathom-backfill', { method: 'POST' });
      const data = await res.json();
      setBackfillResult(
        `Processed: ${data.processed}, Skipped: ${data.skipped}, Errors: ${data.errors}` +
        (data.has_more ? ' (more available - run again)' : ' (complete)')
      );
      fetchMeetings();
    } catch (err: any) {
      setBackfillResult(`Error: ${err.message}`);
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Fathom Meetings</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {total} recording{total !== 1 ? 's' : ''} from Fathom
            </p>
          </div>
          <button
            onClick={runBackfill}
            disabled={backfilling}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
          >
            {backfilling ? 'Importing...' : 'Import from Fathom'}
          </button>
        </div>

        {backfillResult && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 rounded-lg text-sm">
            {backfillResult}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All statuses</option>
            <option value="matched">Matched</option>
            <option value="needs_review">Needs Review</option>
            <option value="pending">Pending</option>
            <option value="error">Error</option>
          </select>
        </div>

        {/* Meeting List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-2">No meetings found</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Click "Import from Fathom" to pull in your recordings, or set up the webhook for automatic capture.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((m) => (
              <div
                key={m.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* Card header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750"
                  onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900 dark:text-white truncate">
                          {m.title || m.meeting_title || 'Untitled Meeting'}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.processing_status] || 'bg-gray-100 text-gray-800'}`}>
                          {m.processing_status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                        <span>{formatDate(m.recorded_at)}</span>
                        <span>{formatDuration(m.duration_seconds)}</span>
                        {m.clients && (
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                            {m.clients.name}
                          </span>
                        )}
                        {m.calendar_invitees && (
                          <span>{m.calendar_invitees.length} participant{m.calendar_invitees.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {m.share_url && (
                        <a
                          href={m.share_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                        >
                          Watch
                        </a>
                      )}
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${expandedId === m.id ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedId === m.id && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
                    {/* Participants */}
                    {m.calendar_invitees && m.calendar_invitees.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Participants</h4>
                        <div className="flex flex-wrap gap-2">
                          {m.calendar_invitees.map((inv: any, i: number) => (
                            <span
                              key={i}
                              className={`px-2 py-1 rounded-full text-xs ${
                                inv.is_external
                                  ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {inv.name || inv.email}
                              {inv.is_external && ' (external)'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Summary */}
                    {m.fathom_summary && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Summary</h4>
                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                          {m.fathom_summary}
                        </div>
                      </div>
                    )}

                    {/* Action Items */}
                    {m.fathom_action_items && m.fathom_action_items.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Action Items</h4>
                        <ul className="space-y-1">
                          {m.fathom_action_items.map((item: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                              <span className="mt-1 w-4 h-4 rounded border border-gray-300 dark:border-gray-600 flex-shrink-0" />
                              <span>{typeof item === 'string' ? item : item.text || JSON.stringify(item)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-4 text-xs text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <span>Fathom ID: {m.fathom_recording_id}</span>
                      {m.matched_by && <span>Matched by: {m.matched_by}</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
