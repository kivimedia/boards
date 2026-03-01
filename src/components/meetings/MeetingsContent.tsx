'use client';

import { useState, useEffect, useCallback } from 'react';
import ClientEngagementView from './ClientEngagementView';

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
  ai_summary: string | null;
  ai_action_items: any[] | null;
}

interface Client {
  id: string;
  name: string;
}

interface Feedback {
  is_positive: boolean | null;
  positive_count: number;
  negative_count: number;
}

const STATUS_COLORS: Record<string, string> = {
  matched: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  needs_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  analyzed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
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

interface MeetingStats {
  total: number;
  this_week: number;
  avg_duration_minutes: number;
  unmatched: number;
  analyzed: number;
}

interface SemanticResult {
  id: string;
  title: string;
  snippet: string;
  similarity: number;
}

export default function MeetingsContent() {
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
  const [stats, setStats] = useState<MeetingStats | null>(null);
  const [smartSearch, setSmartSearch] = useState(false);
  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [searchingSemantics, setSearchingSemantics] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientFilter, setClientFilter] = useState('');
  const [feedbackMap, setFeedbackMap] = useState<Record<string, Feedback>>({});
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [emailToast, setEmailToast] = useState<string | null>(null);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      if (clientFilter) params.set('client_id', clientFilter);

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
  }, [page, statusFilter, search, clientFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch meeting stats:', err);
    }
  }, []);

  // Fetch clients for filter dropdown
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/clients');
        const json = await res.json();
        setClients((json.data || json || []).map((c: any) => ({ id: c.id, name: c.name })));
      } catch {}
    })();
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
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

  const runSemanticSearch = async (query: string) => {
    if (!query.trim()) {
      setSemanticResults([]);
      return;
    }
    setSearchingSemantics(true);
    try {
      const res = await fetch('/api/meetings/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        const data = await res.json();
        setSemanticResults(data.results || []);
      }
    } catch (err) {
      console.error('Semantic search failed:', err);
    } finally {
      setSearchingSemantics(false);
    }
  };

  const analyzeMeeting = async (meetingId: string) => {
    setAnalyzingId(meetingId);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/analyze`, { method: 'POST' });
      if (res.ok) {
        await fetchMeetings();
        await fetchStats();
      }
    } catch (err) {
      console.error('Failed to analyze meeting:', err);
    } finally {
      setAnalyzingId(null);
    }
  };

  const emailSummary = async (meetingId: string) => {
    setEmailingId(meetingId);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/email`, { method: 'POST' });
      if (res.ok) {
        setEmailToast('Email draft created');
        setTimeout(() => setEmailToast(null), 3000);
      } else {
        const data = await res.json();
        setEmailToast(data.error || 'Failed to create email');
        setTimeout(() => setEmailToast(null), 3000);
      }
    } catch {
      setEmailToast('Failed to create email');
      setTimeout(() => setEmailToast(null), 3000);
    } finally {
      setEmailingId(null);
    }
  };

  const fetchFeedback = async (meetingId: string) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/feedback`);
      if (res.ok) {
        const data = await res.json();
        setFeedbackMap(prev => ({ ...prev, [meetingId]: data }));
      }
    } catch {}
  };

  const submitFeedback = async (meetingId: string, isPositive: boolean) => {
    const current = feedbackMap[meetingId];
    // Toggle off if same value
    const newVal = current?.is_positive === isPositive ? null : isPositive;
    try {
      if (newVal === null) {
        // No API for delete - submit opposite then same to toggle (or just re-submit)
        // Actually our API upserts, so submit opposite of what was there
        // Simplest: just submit the value as-is and let upsert handle it
      }
      const res = await fetch(`/api/meetings/${meetingId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_positive: isPositive }),
      });
      if (res.ok) {
        await fetchFeedback(meetingId);
      }
    } catch {}
  };

  // Fetch feedback when a meeting is expanded
  useEffect(() => {
    if (expandedId) {
      const m = meetings.find(m => m.id === expandedId);
      if (m?.ai_summary && !feedbackMap[expandedId]) {
        fetchFeedback(expandedId);
      }
    }
  }, [expandedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-4 sm:p-6">
      {/* Email toast */}
      {emailToast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg shadow-lg text-sm">
          {emailToast}
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Stats Dashboard */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Total', value: stats.total },
              { label: 'This Week', value: stats.this_week },
              { label: 'Avg Duration', value: `${stats.avg_duration_minutes}m` },
              { label: 'Unmatched', value: stats.unmatched },
              { label: 'Analyzed', value: stats.analyzed },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 text-center"
              >
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{stat.label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
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
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              placeholder={smartSearch ? 'Semantic search across transcripts...' : 'Search meetings...'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
                if (smartSearch && e.target.value.trim()) {
                  runSemanticSearch(e.target.value);
                } else {
                  setSemanticResults([]);
                }
              }}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
            <button
              onClick={() => {
                setSmartSearch(!smartSearch);
                setSemanticResults([]);
              }}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                smartSearch
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Smart Search
            </button>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All statuses</option>
            <option value="matched">Matched</option>
            <option value="needs_review">Needs Review</option>
            <option value="pending">Pending</option>
            <option value="analyzed">Analyzed</option>
            <option value="error">Error</option>
          </select>
          <select
            value={clientFilter}
            onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Client Engagement View */}
        {clientFilter && <ClientEngagementView clientId={clientFilter} />}

        {/* Semantic Search Results */}
        {smartSearch && semanticResults.length > 0 && (
          <div className="mb-4 space-y-2">
            <h3 className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-2">
              {searchingSemantics ? 'Searching...' : `${semanticResults.length} semantic result${semanticResults.length !== 1 ? 's' : ''}`}
            </h3>
            {semanticResults.map((r) => (
              <div
                key={r.id}
                className="bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900 dark:text-white text-sm">{r.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                    {(r.similarity * 100).toFixed(0)}% match
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{r.snippet}</p>
              </div>
            ))}
          </div>
        )}

        {smartSearch && searchingSemantics && semanticResults.length === 0 && (
          <div className="mb-4 text-center py-4 text-sm text-purple-500">Searching transcripts...</div>
        )}

        {/* Meeting List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-2">No meetings found</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Click &quot;Import from Fathom&quot; to pull in your recordings, or set up the webhook for automatic capture.
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
                      {m.ai_summary && m.matched_client_id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); emailSummary(m.id); }}
                          disabled={emailingId === m.id}
                          className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50"
                        >
                          {emailingId === m.id ? 'Drafting...' : 'Email Summary'}
                        </button>
                      )}
                      {m.ai_summary ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); analyzeMeeting(m.id); }}
                          disabled={analyzingId === m.id}
                          className="px-2 py-1 text-purple-600 dark:text-purple-400 text-xs hover:underline disabled:opacity-50"
                        >
                          {analyzingId === m.id ? 'Analyzing...' : 'Re-analyze'}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); analyzeMeeting(m.id); }}
                          disabled={analyzingId === m.id}
                          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50"
                        >
                          {analyzingId === m.id ? 'Analyzing...' : 'Analyze'}
                        </button>
                      )}
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

                    {/* AI Summary */}
                    {m.ai_summary && (
                      <div className="border-l-4 border-purple-400 dark:border-purple-600 pl-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase">AI Summary</h4>
                          {/* Feedback thumbs */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => submitFeedback(m.id, true)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                feedbackMap[m.id]?.is_positive === true
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : 'text-gray-400 hover:text-green-600 dark:hover:text-green-400'
                              }`}
                              title="Good summary"
                            >
                              <svg className="w-4 h-4" fill={feedbackMap[m.id]?.is_positive === true ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                              </svg>
                              {feedbackMap[m.id]?.positive_count || 0}
                            </button>
                            <button
                              onClick={() => submitFeedback(m.id, false)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                                feedbackMap[m.id]?.is_positive === false
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                  : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400'
                              }`}
                              title="Needs improvement"
                            >
                              <svg className="w-4 h-4" fill={feedbackMap[m.id]?.is_positive === false ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                              </svg>
                              {feedbackMap[m.id]?.negative_count || 0}
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-purple-50 dark:bg-purple-900/10 rounded-lg p-3">
                          {m.ai_summary}
                        </div>
                      </div>
                    )}

                    {/* AI Action Items */}
                    {m.ai_action_items && m.ai_action_items.length > 0 && (
                      <div className="border-l-4 border-purple-400 dark:border-purple-600 pl-4">
                        <h4 className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase mb-2">AI Action Items</h4>
                        <ul className="space-y-1">
                          {m.ai_action_items.map((item: any, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                              <input type="checkbox" className="mt-1 w-4 h-4 rounded border-purple-300 dark:border-purple-600 text-purple-600 focus:ring-purple-500 flex-shrink-0" />
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
