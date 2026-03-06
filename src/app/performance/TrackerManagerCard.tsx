'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { PKTrackerSummary } from '@/lib/types';

interface TrackerManagerCardProps {
  tracker: PKTrackerSummary;
  canEdit: boolean;
}

interface ClientUpdateDraft {
  account_manager_name: string;
  client_name: string;
  date_sent: string;
  on_time: '' | 'true' | 'false';
  method: string;
  notes: string;
}

const CLIENT_UPDATE_TYPE = 'client_updates';

const HIDDEN_COLUMNS = new Set([
  'id',
  'created_at',
  'updated_at',
  'synced_at',
  'source_tab',
  'source_row',
]);

const IMMUTABLE_COLUMNS = new Set([
  'id',
  'created_at',
  'updated_at',
  'synced_at',
  'source_tab',
  'source_row',
]);

const INPUT_CLASS =
  'w-full px-2 py-1 rounded border border-cream-dark/70 dark:border-white/20 bg-white dark:bg-white/5 text-xs text-navy dark:text-white';

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  const str = String(value);
  if (str.length > 90) return `${str.slice(0, 90)}...`;
  return str;
}

function rowToPatch(row: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    if (!IMMUTABLE_COLUMNS.has(key)) {
      patch[key] = value;
    }
  });
  return patch;
}

function toDateInput(value: unknown): string {
  if (!value) return '';
  const str = String(value);
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function toClientDraft(row: Record<string, unknown>): ClientUpdateDraft {
  return {
    account_manager_name: String(row.account_manager_name || ''),
    client_name: String(row.client_name || ''),
    date_sent: toDateInput(row.date_sent),
    on_time:
      row.on_time === true || row.on_time === 'true'
        ? 'true'
        : row.on_time === false || row.on_time === 'false'
          ? 'false'
          : '',
    method: String(row.method || ''),
    notes: String(row.notes || ''),
  };
}

function emptyClientDraft(): ClientUpdateDraft {
  return {
    account_manager_name: '',
    client_name: '',
    date_sent: '',
    on_time: '',
    method: '',
    notes: '',
  };
}

function draftToPayload(draft: ClientUpdateDraft) {
  return {
    account_manager_name: draft.account_manager_name.trim(),
    client_name: draft.client_name.trim() || null,
    date_sent: draft.date_sent || null,
    on_time: draft.on_time === '' ? null : draft.on_time === 'true',
    method: draft.method.trim() || null,
    notes: draft.notes.trim() || null,
  };
}

export default function TrackerManagerCard({ tracker, canEdit }: TrackerManagerCardProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState('');
  const [savingJsonEdit, setSavingJsonEdit] = useState(false);

  const [clientDrafts, setClientDrafts] = useState<Record<string, ClientUpdateDraft>>({});
  const [newClientDraft, setNewClientDraft] = useState<ClientUpdateDraft>(emptyClientDraft());
  const [creatingClientRow, setCreatingClientRow] = useState(false);
  const [savingClientRowId, setSavingClientRowId] = useState<string | null>(null);
  const [deletingClientRowId, setDeletingClientRowId] = useState<string | null>(null);

  const isClientUpdates = tracker.tracker_type === CLIENT_UPDATE_TYPE;

  const freshnessColors = {
    fresh: 'bg-green-500',
    stale: 'bg-yellow-500',
    overdue: 'bg-red-500',
  };

  const visibleColumns = useMemo(() => {
    if (rows.length === 0) return [] as string[];
    const keys = Object.keys(rows[0]).filter((key) => !HIDDEN_COLUMNS.has(key));
    return keys.slice(0, 6);
  }, [rows]);

  useEffect(() => {
    if (!isClientUpdates) return;
    const nextDrafts: Record<string, ClientUpdateDraft> = {};
    for (const row of rows) {
      if (!row.id) continue;
      nextDrafts[String(row.id)] = toClientDraft(row);
    }
    setClientDrafts(nextDrafts);
  }, [isClientUpdates, rows]);

  const loadRows = async () => {
    setLoading(true);
    setErrorText(null);

    try {
      const params = new URLSearchParams({
        type: tracker.tracker_type,
        limit: '12',
        offset: '0',
      });

      const res = await fetch(`/api/performance/tracker?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load tracker rows');
      }

      const payload = json.data || json;
      setRows(payload.rows || []);
      setTotal(payload.total || 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tracker rows';
      setErrorText(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next && rows.length === 0) {
      await loadRows();
    }
  };

  const startJsonEdit = (row: Record<string, unknown>) => {
    const rowId = row.id ? String(row.id) : null;
    if (!rowId) return;
    setEditingRowId(rowId);
    setEditJson(JSON.stringify(rowToPatch(row), null, 2));
    setErrorText(null);
  };

  const saveJsonEdit = async () => {
    if (!editingRowId) return;
    setSavingJsonEdit(true);
    setErrorText(null);

    try {
      const parsed = JSON.parse(editJson) as Record<string, unknown>;
      const res = await fetch('/api/performance/tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: tracker.tracker_type,
          id: editingRowId,
          patch: parsed,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update row');
      }

      setEditingRowId(null);
      setEditJson('');
      await loadRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update row';
      setErrorText(msg);
    } finally {
      setSavingJsonEdit(false);
    }
  };

  const updateClientDraft = (
    rowId: string,
    key: keyof ClientUpdateDraft,
    value: string
  ) => {
    setClientDrafts((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || emptyClientDraft()),
        [key]: value,
      },
    }));
  };

  const saveClientRow = async (rowId: string) => {
    const draft = clientDrafts[rowId];
    if (!draft) return;
    if (!draft.account_manager_name.trim()) {
      setErrorText('AM is required.');
      return;
    }

    setSavingClientRowId(rowId);
    setErrorText(null);

    try {
      const res = await fetch('/api/performance/tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: tracker.tracker_type,
          id: rowId,
          patch: draftToPayload(draft),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save row');
      }
      await loadRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save row';
      setErrorText(msg);
    } finally {
      setSavingClientRowId(null);
    }
  };

  const createClientRow = async () => {
    if (!newClientDraft.account_manager_name.trim()) {
      setErrorText('AM is required to add a row.');
      return;
    }

    setCreatingClientRow(true);
    setErrorText(null);

    try {
      const res = await fetch('/api/performance/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: tracker.tracker_type,
          row: {
            ...draftToPayload(newClientDraft),
            source_tab: 'manual_ui',
            source_row: null,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to add row');
      }

      const keepAm = newClientDraft.account_manager_name;
      setNewClientDraft({
        ...emptyClientDraft(),
        account_manager_name: keepAm,
      });
      await loadRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add row';
      setErrorText(msg);
    } finally {
      setCreatingClientRow(false);
    }
  };

  const deleteClientRow = async (rowId: string) => {
    setDeletingClientRowId(rowId);
    setErrorText(null);

    try {
      const res = await fetch('/api/performance/tracker', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: tracker.tracker_type,
          id: rowId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete row');
      }
      await loadRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete row';
      setErrorText(msg);
    } finally {
      setDeletingClientRowId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-white/5 rounded-xl border border-cream-dark/60 dark:border-white/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-navy dark:text-white">{tracker.label}</h4>
            <span className={`w-2 h-2 rounded-full ${freshnessColors[tracker.freshness]}`} />
          </div>
          <p className="text-xs text-navy/50 dark:text-white/40 mt-1">
            {tracker.total_rows.toLocaleString()} rows - {tracker.frequency}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/performance/${tracker.tracker_type}`}
            className="text-xs px-2 py-1 rounded border border-cream-dark/70 dark:border-white/20 text-navy/70 dark:text-white/70 hover:bg-cream-dark/30 dark:hover:bg-white/10"
          >
            Full Page
          </Link>
          <button
            onClick={toggleOpen}
            className="text-xs px-2 py-1 rounded bg-electric text-white hover:bg-electric/90"
          >
            {open ? 'Hide Rows' : 'Manage Rows'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-navy/50 dark:text-white/40">
              Data is loaded from database tables, not directly from Google Sheets.
            </p>
            <button
              onClick={loadRows}
              disabled={loading}
              className="text-xs text-electric hover:text-electric/80 font-medium"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {errorText && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-700 dark:text-red-300">
              {errorText}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="h-8 rounded bg-cream-dark/40 dark:bg-white/10 animate-pulse" />
              ))}
            </div>
          ) : isClientUpdates ? (
            <div className="overflow-x-auto border border-cream-dark/50 dark:border-white/10 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-cream-dark/20 dark:bg-white/5 border-b border-cream-dark/40 dark:border-white/10">
                    <th className="text-left px-2 py-2 font-medium text-navy/60 dark:text-white/50">AM</th>
                    <th className="text-left px-2 py-2 font-medium text-navy/60 dark:text-white/50">Client</th>
                    <th className="text-left px-2 py-2 font-medium text-navy/60 dark:text-white/50">Date Sent</th>
                    <th className="text-left px-2 py-2 font-medium text-navy/60 dark:text-white/50">On Time</th>
                    <th className="text-left px-2 py-2 font-medium text-navy/60 dark:text-white/50">Method</th>
                    <th className="text-left px-2 py-2 font-medium text-navy/60 dark:text-white/50">Notes</th>
                    {canEdit && (
                      <th className="text-right px-2 py-2 font-medium text-navy/60 dark:text-white/50">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {canEdit && (
                    <tr className="bg-blue-50/70 dark:bg-blue-500/10 border-b border-cream-dark/30 dark:border-white/5">
                      <td className="px-2 py-2 min-w-[150px]">
                        <input
                          value={newClientDraft.account_manager_name}
                          onChange={(e) => setNewClientDraft((prev) => ({ ...prev, account_manager_name: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Account manager"
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[150px]">
                        <input
                          value={newClientDraft.client_name}
                          onChange={(e) => setNewClientDraft((prev) => ({ ...prev, client_name: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Client"
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[130px]">
                        <input
                          type="date"
                          value={newClientDraft.date_sent}
                          onChange={(e) => setNewClientDraft((prev) => ({ ...prev, date_sent: e.target.value }))}
                          className={INPUT_CLASS}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[110px]">
                        <select
                          value={newClientDraft.on_time}
                          onChange={(e) => setNewClientDraft((prev) => ({ ...prev, on_time: e.target.value as ClientUpdateDraft['on_time'] }))}
                          className={INPUT_CLASS}
                        >
                          <option value="">-</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </td>
                      <td className="px-2 py-2 min-w-[150px]">
                        <input
                          value={newClientDraft.method}
                          onChange={(e) => setNewClientDraft((prev) => ({ ...prev, method: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Method"
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[220px]">
                        <input
                          value={newClientDraft.notes}
                          onChange={(e) => setNewClientDraft((prev) => ({ ...prev, notes: e.target.value }))}
                          className={INPUT_CLASS}
                          placeholder="Notes"
                        />
                      </td>
                      <td className="px-2 py-2 text-right min-w-[120px]">
                        <button
                          onClick={createClientRow}
                          disabled={creatingClientRow}
                          className={`text-[11px] px-2 py-1 rounded ${
                            creatingClientRow
                              ? 'bg-navy/10 dark:bg-white/10 text-navy/40 dark:text-white/40 cursor-not-allowed'
                              : 'bg-electric text-white hover:bg-electric/90'
                          }`}
                        >
                          {creatingClientRow ? 'Adding...' : 'Add Row'}
                        </button>
                      </td>
                    </tr>
                  )}

                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6} className="px-2 py-4 text-center text-xs text-navy/50 dark:text-white/40">
                        No rows found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => {
                      const rowId = row.id ? String(row.id) : '';
                      const draft = rowId ? (clientDrafts[rowId] || toClientDraft(row)) : toClientDraft(row);
                      const isSaving = savingClientRowId === rowId;
                      const isDeleting = deletingClientRowId === rowId;

                      return (
                        <tr key={rowId || `row-${idx}`} className="border-b border-cream-dark/30 dark:border-white/5 last:border-0">
                          <td className="px-2 py-2 min-w-[150px]">
                            {canEdit ? (
                              <input
                                value={draft.account_manager_name}
                                onChange={(e) => rowId && updateClientDraft(rowId, 'account_manager_name', e.target.value)}
                                className={INPUT_CLASS}
                              />
                            ) : (
                              <span className="text-navy dark:text-white/80">{formatCell(row.account_manager_name)}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 min-w-[150px]">
                            {canEdit ? (
                              <input
                                value={draft.client_name}
                                onChange={(e) => rowId && updateClientDraft(rowId, 'client_name', e.target.value)}
                                className={INPUT_CLASS}
                              />
                            ) : (
                              <span className="text-navy dark:text-white/80">{formatCell(row.client_name)}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 min-w-[130px]">
                            {canEdit ? (
                              <input
                                type="date"
                                value={draft.date_sent}
                                onChange={(e) => rowId && updateClientDraft(rowId, 'date_sent', e.target.value)}
                                className={INPUT_CLASS}
                              />
                            ) : (
                              <span className="text-navy dark:text-white/80">{formatCell(row.date_sent)}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 min-w-[110px]">
                            {canEdit ? (
                              <select
                                value={draft.on_time}
                                onChange={(e) => rowId && updateClientDraft(rowId, 'on_time', e.target.value)}
                                className={INPUT_CLASS}
                              >
                                <option value="">-</option>
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                              </select>
                            ) : (
                              <span className="text-navy dark:text-white/80">{formatCell(row.on_time)}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 min-w-[150px]">
                            {canEdit ? (
                              <input
                                value={draft.method}
                                onChange={(e) => rowId && updateClientDraft(rowId, 'method', e.target.value)}
                                className={INPUT_CLASS}
                              />
                            ) : (
                              <span className="text-navy dark:text-white/80">{formatCell(row.method)}</span>
                            )}
                          </td>
                          <td className="px-2 py-2 min-w-[220px]">
                            {canEdit ? (
                              <input
                                value={draft.notes}
                                onChange={(e) => rowId && updateClientDraft(rowId, 'notes', e.target.value)}
                                className={INPUT_CLASS}
                              />
                            ) : (
                              <span className="text-navy dark:text-white/80">{formatCell(row.notes)}</span>
                            )}
                          </td>
                          {canEdit && (
                            <td className="px-2 py-2 text-right min-w-[120px]">
                              {rowId ? (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => saveClientRow(rowId)}
                                    disabled={isSaving}
                                    className={`text-[11px] px-2 py-1 rounded ${
                                      isSaving
                                        ? 'bg-navy/10 dark:bg-white/10 text-navy/40 dark:text-white/40 cursor-not-allowed'
                                        : 'bg-electric text-white hover:bg-electric/90'
                                    }`}
                                  >
                                    {isSaving ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    onClick={() => deleteClientRow(rowId)}
                                    disabled={isDeleting}
                                    className={`text-[11px] px-2 py-1 rounded border ${
                                      isDeleting
                                        ? 'border-red-200 text-red-300 dark:border-red-500/20 dark:text-red-500/40 cursor-not-allowed'
                                        : 'border-red-300 text-red-600 dark:border-red-500/30 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
                                    }`}
                                  >
                                    {isDeleting ? 'Deleting...' : 'Delete'}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-navy/40 dark:text-white/30">No ID</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-navy/50 dark:text-white/40">No rows found.</p>
          ) : (
            <div className="overflow-x-auto border border-cream-dark/50 dark:border-white/10 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-cream-dark/20 dark:bg-white/5 border-b border-cream-dark/40 dark:border-white/10">
                    {visibleColumns.map((column) => (
                      <th key={column} className="text-left px-2 py-2 font-medium text-navy/60 dark:text-white/50 whitespace-nowrap">
                        {column}
                      </th>
                    ))}
                    {canEdit && (
                      <th className="text-right px-2 py-2 font-medium text-navy/60 dark:text-white/50">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const rowId = row.id ? String(row.id) : `row-${idx}`;
                    return (
                      <tr key={rowId} className="border-b border-cream-dark/30 dark:border-white/5 last:border-0">
                        {visibleColumns.map((column) => (
                          <td key={column} className="px-2 py-2 text-navy dark:text-white/80 whitespace-nowrap">
                            {formatCell(row[column])}
                          </td>
                        ))}
                        {canEdit && (
                          <td className="px-2 py-2 text-right">
                            <button
                              onClick={() => startJsonEdit(row)}
                              className="text-[11px] px-2 py-1 rounded border border-cream-dark/70 dark:border-white/20 text-navy/70 dark:text-white/70 hover:bg-cream-dark/30 dark:hover:bg-white/10"
                            >
                              Edit JSON
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!isClientUpdates && editingRowId && canEdit && (
            <div className="rounded-lg border border-cream-dark/70 dark:border-white/15 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-navy dark:text-white">Edit Row: {editingRowId}</p>
                <button
                  onClick={() => { setEditingRowId(null); setEditJson(''); }}
                  className="text-xs text-navy/50 dark:text-white/40 hover:text-navy/70 dark:hover:text-white/70"
                >
                  Cancel
                </button>
              </div>
              <textarea
                value={editJson}
                onChange={(e) => setEditJson(e.target.value)}
                rows={9}
                className="w-full font-mono text-xs px-3 py-2 rounded border border-cream-dark/70 dark:border-white/15 bg-white dark:bg-white/5 text-navy dark:text-white"
              />
              <div className="flex justify-end">
                <button
                  onClick={saveJsonEdit}
                  disabled={savingJsonEdit}
                  className={`text-xs px-3 py-1.5 rounded ${
                    savingJsonEdit
                      ? 'bg-navy/10 dark:bg-white/10 text-navy/40 dark:text-white/40 cursor-not-allowed'
                      : 'bg-electric text-white hover:bg-electric/90'
                  }`}
                >
                  {savingJsonEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          <p className="text-[11px] text-navy/40 dark:text-white/30">
            Showing up to 12 rows here. Open Full Page for full pagination ({total.toLocaleString()} total rows).
          </p>
        </div>
      )}
    </div>
  );
}
