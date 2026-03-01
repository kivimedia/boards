'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Client {
  id: string;
  name: string;
}

interface Identity {
  id: string;
  email: string | null;
  display_name: string | null;
  fathom_speaker_name: string | null;
  client_id: string | null;
  contact_name: string | null;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
  clients: { id: string; name: string } | null;
  meeting_count: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  low: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function IdentityManager() {
  // Data state
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('');
  const [confirmedFilter, setConfirmedFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Inline action state
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkClientId, setBulkClientId] = useState('');

  // Debounce timer
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // -------------------------------------------------------------------------
  // Debounced search
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  // -------------------------------------------------------------------------
  // Fetch clients once
  // -------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/clients');
        const json = await res.json();
        // API wraps data in { data: [...] }
        setClients(
          (json.data || json || []).map((c: any) => ({ id: c.id, name: c.name }))
        );
      } catch (err) {
        console.error('Failed to load clients:', err);
      }
    })();
  }, []);

  // -------------------------------------------------------------------------
  // Fetch identities
  // -------------------------------------------------------------------------
  const fetchIdentities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (confidenceFilter) params.set('confidence', confidenceFilter);
      if (confirmedFilter) params.set('confirmed', confirmedFilter);
      if (clientFilter) params.set('client_id', clientFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`/api/meetings/identities?${params}`);
      const data = await res.json();

      setIdentities(data.identities || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error('Failed to fetch identities:', err);
    } finally {
      setLoading(false);
    }
  }, [page, confidenceFilter, confirmedFilter, clientFilter, debouncedSearch]);

  useEffect(() => {
    fetchIdentities();
  }, [fetchIdentities]);

  // -------------------------------------------------------------------------
  // Single identity actions
  // -------------------------------------------------------------------------
  const patchIdentity = async (
    identityId: string,
    body: Record<string, unknown>
  ) => {
    setUpdatingIds((prev) => new Set(prev).add(identityId));
    try {
      const res = await fetch(`/api/meetings/identities/${identityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        await fetchIdentities();
      }
    } catch (err) {
      console.error('Patch failed:', err);
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(identityId);
        return next;
      });
    }
  };

  const deleteIdentity = async (identityId: string) => {
    if (!window.confirm('Delete this identity? This cannot be undone.')) return;
    setUpdatingIds((prev) => new Set(prev).add(identityId));
    try {
      const res = await fetch(`/api/meetings/identities/${identityId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(identityId);
          return next;
        });
        await fetchIdentities();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(identityId);
        return next;
      });
    }
  };

  // -------------------------------------------------------------------------
  // Inline client assignment
  // -------------------------------------------------------------------------
  const assignClient = (identityId: string, clientId: string) => {
    patchIdentity(identityId, {
      client_id: clientId || null,
      confirm: clientId ? true : false,
    });
  };

  // -------------------------------------------------------------------------
  // Bulk actions
  // -------------------------------------------------------------------------
  const bulkConfirm = async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/meetings/identities/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), action: 'confirm' }),
      });
      if (res.ok) {
        setSelected(new Set());
        await fetchIdentities();
      }
    } catch (err) {
      console.error('Bulk confirm failed:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkAssign = async () => {
    if (selected.size === 0 || !bulkClientId) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/meetings/identities/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selected),
          action: 'assign',
          client_id: bulkClientId,
        }),
      });
      if (res.ok) {
        setSelected(new Set());
        setBulkClientId('');
        await fetchIdentities();
      }
    } catch (err) {
      console.error('Bulk assign failed:', err);
    } finally {
      setBulkLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------------
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === identities.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(identities.map((i) => i.id)));
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {total} participant{total !== 1 ? 's' : ''} identified across meetings
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Search by name, email, speaker..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
          <select
            value={confidenceFilter}
            onChange={(e) => {
              setConfidenceFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All confidence</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={confirmedFilter}
            onChange={(e) => {
              setConfirmedFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All status</option>
            <option value="false">Unconfirmed</option>
            <option value="true">Confirmed</option>
          </select>
          <select
            value={clientFilter}
            onChange={(e) => {
              setClientFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Bulk actions bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              {selected.size} selected
            </span>
            <button
              onClick={bulkConfirm}
              disabled={bulkLoading}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {bulkLoading ? 'Processing...' : 'Confirm Selected'}
            </button>
            <div className="flex items-center gap-2">
              <select
                value={bulkClientId}
                onChange={(e) => setBulkClientId(e.target.value)}
                className="px-2 py-1.5 border border-indigo-300 dark:border-indigo-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs"
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={bulkAssign}
                disabled={bulkLoading || !bulkClientId}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Assign to Client
              </button>
            </div>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Loading identities...
          </div>
        ) : identities.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              No identities found
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Identities are created automatically when Fathom meetings are
              imported. Adjust your filters or import more meetings.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={
                        identities.length > 0 &&
                        selected.size === identities.length
                      }
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Name
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Email
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Speaker Name
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Client
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Confidence
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Confirmed
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Meetings
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {identities.map((identity) => {
                  const isUpdating = updatingIds.has(identity.id);
                  return (
                    <tr
                      key={identity.id}
                      className={`bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                        isUpdating ? 'opacity-60' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(identity.id)}
                          onChange={() => toggleSelect(identity.id)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>

                      {/* Name */}
                      <td className="px-3 py-3 text-gray-900 dark:text-white font-medium whitespace-nowrap">
                        {identity.display_name || '-'}
                      </td>

                      {/* Email */}
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {identity.email || '-'}
                      </td>

                      {/* Speaker Name */}
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {identity.fathom_speaker_name || '-'}
                      </td>

                      {/* Client Dropdown */}
                      <td className="px-3 py-3">
                        <select
                          value={identity.client_id || ''}
                          onChange={(e) =>
                            assignClient(identity.id, e.target.value)
                          }
                          disabled={isUpdating}
                          className="w-full px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs disabled:opacity-50"
                        >
                          <option value="">Unassigned</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Confidence Badge */}
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            CONFIDENCE_COLORS[identity.confidence] ||
                            'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {identity.confidence}
                        </span>
                      </td>

                      {/* Confirmed */}
                      <td className="px-3 py-3 text-center">
                        {identity.confirmed_at ? (
                          <svg
                            className="w-5 h-5 text-green-600 dark:text-green-400 mx-auto"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600">
                            -
                          </span>
                        )}
                      </td>

                      {/* Meetings */}
                      <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">
                        {identity.meeting_count}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {!identity.confirmed_at && (
                            <button
                              onClick={() =>
                                patchIdentity(identity.id, { confirm: true })
                              }
                              disabled={isUpdating}
                              className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded text-xs font-medium hover:bg-green-100 dark:hover:bg-green-900/40 disabled:opacity-50"
                            >
                              Confirm
                            </button>
                          )}
                          <button
                            onClick={() => deleteIdentity(identity.id)}
                            disabled={isUpdating}
                            className="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
