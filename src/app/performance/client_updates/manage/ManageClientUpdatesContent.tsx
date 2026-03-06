'use client';

import { useEffect, useMemo, useState } from 'react';

interface ManageClientUpdatesContentProps {
  initialAmNames: string[];
  canManage: boolean;
}

interface ClientUpdateDraft {
  account_manager_name: string;
  client_name: string;
  date_sent: string;
  on_time: '' | 'true' | 'false';
  method: string;
  notes: string;
}

const INPUT_CLASS =
  'w-full px-2 py-1 rounded border border-cream-dark/70 dark:border-white/20 bg-white dark:bg-white/5 text-xs text-navy dark:text-white';

function emptyDraft(amName = ''): ClientUpdateDraft {
  return {
    account_manager_name: amName,
    client_name: '',
    date_sent: '',
    on_time: '',
    method: '',
    notes: '',
  };
}

function toDateInput(value: unknown): string {
  if (!value) return '';
  const str = String(value);
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function toDraft(row: Record<string, unknown>): ClientUpdateDraft {
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

export default function ManageClientUpdatesContent({
  initialAmNames,
  canManage,
}: ManageClientUpdatesContentProps) {
  const [amNames, setAmNames] = useState<string[]>(initialAmNames);
  const [selectedAm, setSelectedAm] = useState(initialAmNames[0] || '');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ClientUpdateDraft>>({});
  const [newDraft, setNewDraft] = useState<ClientUpdateDraft>(emptyDraft(initialAmNames[0] || ''));
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [openActionsRowId, setOpenActionsRowId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  const sortedAmNames = useMemo(
    () => Array.from(new Set(amNames.map((n) => n.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [amNames]
  );

  const loadRows = async (am = selectedAm) => {
    if (!am) {
      setRows([]);
      setDrafts({});
      setOpenActionsRowId(null);
      return;
    }

    setLoading(true);
    setErrorText(null);

    try {
      const params = new URLSearchParams({
        type: 'client_updates',
        am,
        limit: '1000',
        offset: '0',
      });
      const res = await fetch(`/api/performance/tracker?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load rows');
      }

      const payload = json.data || json;
      const nextRows = payload.rows || [];
      setRows(nextRows);

      const nextDrafts: Record<string, ClientUpdateDraft> = {};
      for (const row of nextRows) {
        if (!row.id) continue;
        nextDrafts[String(row.id)] = toDraft(row);
      }
      setDrafts(nextDrafts);
      setOpenActionsRowId(null);

      setNewDraft((prev) => ({ ...prev, account_manager_name: am }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load rows';
      setErrorText(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAm) {
      loadRows(selectedAm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAm]);

  const updateDraft = <K extends keyof ClientUpdateDraft>(
    rowId: string,
    key: K,
    value: ClientUpdateDraft[K]
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || emptyDraft(selectedAm)),
        [key]: value,
      },
    }));
  };

  const saveRow = async (rowId: string) => {
    const draft = drafts[rowId];
    if (!draft) return;
    if (!draft.account_manager_name.trim()) {
      setErrorText('AM is required.');
      return;
    }

    setSavingRowId(rowId);
    setErrorText(null);
    setStatusText(null);

    try {
      const res = await fetch('/api/performance/tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'client_updates',
          id: rowId,
          patch: draftToPayload(draft),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save row');
      }

      setStatusText('Row saved.');
      setOpenActionsRowId(null);
      await loadRows(selectedAm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save row';
      setErrorText(msg);
    } finally {
      setSavingRowId(null);
    }
  };

  const createRow = async () => {
    if (!newDraft.account_manager_name.trim()) {
      setErrorText('AM is required to add a row.');
      return;
    }

    setCreating(true);
    setErrorText(null);
    setStatusText(null);

    try {
      const res = await fetch('/api/performance/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'client_updates',
          row: {
            ...draftToPayload(newDraft),
            source_tab: 'manual_ui',
            source_row: null,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to add row');
      }

      if (!sortedAmNames.includes(newDraft.account_manager_name.trim())) {
        setAmNames((prev) => [...prev, newDraft.account_manager_name.trim()]);
      }

      const keepAm = newDraft.account_manager_name.trim();
      setSelectedAm(keepAm);
      setNewDraft(emptyDraft(keepAm));
      setStatusText('Row added.');
      await loadRows(keepAm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add row';
      setErrorText(msg);
    } finally {
      setCreating(false);
    }
  };

  const deleteRow = async (rowId: string) => {
    setDeletingRowId(rowId);
    setErrorText(null);
    setStatusText(null);

    try {
      const res = await fetch('/api/performance/tracker', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'client_updates',
          id: rowId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete row');
      }
      setStatusText('Row deleted.');
      setOpenActionsRowId(null);
      await loadRows(selectedAm);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete row';
      setErrorText(msg);
    } finally {
      setDeletingRowId(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 p-4">
          <h2 className="text-sm font-semibold text-navy dark:text-white">Account Managers</h2>
          <p className="text-xs text-navy/50 dark:text-white/40 mt-1">
            Select an account manager to manage Client Updates rows.
          </p>

          {sortedAmNames.length === 0 ? (
            <p className="text-xs text-navy/50 dark:text-white/40 mt-3">No account managers found yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-3">
              {sortedAmNames.map((am) => (
                <button
                  key={am}
                  onClick={() => setSelectedAm(am)}
                  className={`px-3 py-2 rounded-lg text-xs text-left border transition-colors ${
                    selectedAm === am
                      ? 'bg-electric text-white border-electric'
                      : 'bg-white dark:bg-white/5 border-cream-dark/70 dark:border-white/15 text-navy dark:text-white hover:border-electric/40'
                  }`}
                >
                  {am}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-navy dark:text-white">
              {selectedAm ? `Client Updates - ${selectedAm}` : 'Client Updates'}
            </h3>
            <button
              onClick={() => loadRows(selectedAm)}
              disabled={loading || !selectedAm}
              className="text-xs text-electric hover:text-electric/80 font-medium"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {statusText && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-xs text-green-700 dark:text-green-300">
              {statusText}
            </div>
          )}

          {errorText && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-700 dark:text-red-300">
              {errorText}
            </div>
          )}

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
                  {canManage && (
                    <th className="text-right px-2 py-2 font-medium text-navy/60 dark:text-white/50">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {canManage && (
                  <tr className="bg-blue-50/70 dark:bg-blue-500/10 border-b border-cream-dark/30 dark:border-white/5">
                    <td className="px-2 py-2 min-w-[150px]">
                      <input
                        value={newDraft.account_manager_name}
                        onChange={(e) => setNewDraft((prev) => ({ ...prev, account_manager_name: e.target.value }))}
                        className={INPUT_CLASS}
                      />
                    </td>
                    <td className="px-2 py-2 min-w-[150px]">
                      <input
                        value={newDraft.client_name}
                        onChange={(e) => setNewDraft((prev) => ({ ...prev, client_name: e.target.value }))}
                        className={INPUT_CLASS}
                      />
                    </td>
                    <td className="px-2 py-2 min-w-[130px]">
                      <input
                        type="date"
                        value={newDraft.date_sent}
                        onChange={(e) => setNewDraft((prev) => ({ ...prev, date_sent: e.target.value }))}
                        className={INPUT_CLASS}
                      />
                    </td>
                    <td className="px-2 py-2 min-w-[110px]">
                      <select
                        value={newDraft.on_time}
                        onChange={(e) => setNewDraft((prev) => ({ ...prev, on_time: e.target.value as ClientUpdateDraft['on_time'] }))}
                        className={INPUT_CLASS}
                      >
                        <option value="">-</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 min-w-[150px]">
                      <input
                        value={newDraft.method}
                        onChange={(e) => setNewDraft((prev) => ({ ...prev, method: e.target.value }))}
                        className={INPUT_CLASS}
                      />
                    </td>
                    <td className="px-2 py-2 min-w-[220px]">
                      <input
                        value={newDraft.notes}
                        onChange={(e) => setNewDraft((prev) => ({ ...prev, notes: e.target.value }))}
                        className={INPUT_CLASS}
                      />
                    </td>
                    <td className="px-2 py-2 text-right min-w-[120px]">
                      <button
                        onClick={createRow}
                        disabled={creating}
                        className={`text-[11px] px-2 py-1 rounded ${
                          creating
                            ? 'bg-navy/10 dark:bg-white/10 text-navy/40 dark:text-white/40 cursor-not-allowed'
                            : 'bg-electric text-white hover:bg-electric/90'
                        }`}
                      >
                        {creating ? 'Adding...' : 'Add Row'}
                      </button>
                    </td>
                  </tr>
                )}

                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="px-2 py-4 text-center text-xs text-navy/50 dark:text-white/40">
                      {selectedAm ? 'No rows for this account manager.' : 'Select an account manager.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const rowId = row.id ? String(row.id) : '';
                    const draft = rowId ? (drafts[rowId] || toDraft(row)) : toDraft(row);
                    const isSaving = savingRowId === rowId;
                    const isDeleting = deletingRowId === rowId;

                    return (
                      <tr key={rowId || `row-${idx}`} className="border-b border-cream-dark/30 dark:border-white/5 last:border-0">
                        <td className="px-2 py-2 min-w-[150px]">
                          {canManage ? (
                            <input
                              value={draft.account_manager_name}
                              onChange={(e) => rowId && updateDraft(rowId, 'account_manager_name', e.target.value)}
                              className={INPUT_CLASS}
                            />
                          ) : (
                            <span className="text-navy dark:text-white/80">{String(row.account_manager_name || '-')}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 min-w-[150px]">
                          {canManage ? (
                            <input
                              value={draft.client_name}
                              onChange={(e) => rowId && updateDraft(rowId, 'client_name', e.target.value)}
                              className={INPUT_CLASS}
                            />
                          ) : (
                            <span className="text-navy dark:text-white/80">{String(row.client_name || '-')}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 min-w-[130px]">
                          {canManage ? (
                            <input
                              type="date"
                              value={draft.date_sent}
                              onChange={(e) => rowId && updateDraft(rowId, 'date_sent', e.target.value)}
                              className={INPUT_CLASS}
                            />
                          ) : (
                            <span className="text-navy dark:text-white/80">{String(row.date_sent || '-')}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 min-w-[110px]">
                          {canManage ? (
                            <select
                              value={draft.on_time}
                              onChange={(e) =>
                                rowId &&
                                updateDraft(
                                  rowId,
                                  'on_time',
                                  e.target.value as ClientUpdateDraft['on_time']
                                )
                              }
                              className={INPUT_CLASS}
                            >
                              <option value="">-</option>
                              <option value="true">Yes</option>
                              <option value="false">No</option>
                            </select>
                          ) : (
                            <span className="text-navy dark:text-white/80">{String(row.on_time ?? '-')}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 min-w-[150px]">
                          {canManage ? (
                            <input
                              value={draft.method}
                              onChange={(e) => rowId && updateDraft(rowId, 'method', e.target.value)}
                              className={INPUT_CLASS}
                            />
                          ) : (
                            <span className="text-navy dark:text-white/80">{String(row.method || '-')}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 min-w-[220px]">
                          {canManage ? (
                            <input
                              value={draft.notes}
                              onChange={(e) => rowId && updateDraft(rowId, 'notes', e.target.value)}
                              className={INPUT_CLASS}
                            />
                          ) : (
                            <span className="text-navy dark:text-white/80">{String(row.notes || '-')}</span>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-2 py-2 text-right min-w-[120px]">
                            {rowId ? (
                              <div className="relative inline-flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenActionsRowId((current) => (current === rowId ? null : rowId))
                                  }
                                  disabled={isSaving || isDeleting}
                                  className={`text-[11px] px-2 py-1 rounded border border-cream-dark/70 dark:border-white/20 ${
                                    isSaving || isDeleting
                                      ? 'text-navy/40 dark:text-white/40 cursor-not-allowed'
                                      : 'text-navy/70 dark:text-white/70 hover:bg-cream-dark/30 dark:hover:bg-white/10'
                                  }`}
                                  aria-label="Open actions"
                                >
                                  ...
                                </button>

                                {openActionsRowId === rowId && (
                                  <div className="absolute top-full right-0 mt-1 min-w-[110px] rounded-md border border-cream-dark/70 dark:border-white/20 bg-white dark:bg-navy-light shadow-lg z-20 p-1">
                                    <button
                                      type="button"
                                      onClick={() => void saveRow(rowId)}
                                      disabled={isSaving}
                                      className={`w-full text-left text-[11px] px-2 py-1 rounded ${
                                        isSaving
                                          ? 'text-navy/40 dark:text-white/40 cursor-not-allowed'
                                          : 'text-navy dark:text-white hover:bg-cream-dark/30 dark:hover:bg-white/10'
                                      }`}
                                    >
                                      {isSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void deleteRow(rowId)}
                                      disabled={isDeleting}
                                      className={`w-full text-left text-[11px] px-2 py-1 rounded ${
                                        isDeleting
                                          ? 'text-red-300 dark:text-red-500/40 cursor-not-allowed'
                                          : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
                                      }`}
                                    >
                                      {isDeleting ? 'Deleting...' : 'Delete'}
                                    </button>
                                  </div>
                                )}
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
        </div>
      </div>
    </div>
  );
}
