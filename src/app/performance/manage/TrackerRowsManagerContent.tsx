'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TrackerManageConfig,
  TrackerManageField,
} from '@/lib/performance-manage';

interface TrackerRowsManagerContentProps {
  config: TrackerManageConfig;
  initialGroupValues: string[];
  canManage: boolean;
}

type RowDraft = Record<string, string>;

const INPUT_CLASS =
  'w-full px-2 py-1 rounded border border-cream-dark/70 dark:border-white/20 bg-white dark:bg-white/5 text-xs text-navy dark:text-white';

const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-[60px] resize-y`;

function toDateInput(value: unknown): string {
  if (!value) return '';
  const str = String(value);
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function toBooleanInput(value: unknown): string {
  if (value === true || value === 'true') return 'true';
  if (value === false || value === 'false') return 'false';
  return '';
}

function getFieldWidthClass(field: TrackerManageField): string {
  if (field.type === 'date') return 'min-w-[135px]';
  if (field.type === 'boolean') return 'min-w-[120px]';
  if (field.type === 'textarea') return 'min-w-[260px]';
  return 'min-w-[160px]';
}

function renderReadOnlyCell(
  row: Record<string, unknown>,
  field: TrackerManageField
) {
  const value = row[field.key];
  if (value === null || value === undefined || value === '') {
    return <span className="text-navy/30 dark:text-white/30">-</span>;
  }
  if (field.type === 'boolean') {
    return (
      <span className="text-navy dark:text-white/80">
        {value === true || value === 'true' ? 'Yes' : 'No'}
      </span>
    );
  }
  if (field.type === 'date') {
    return (
      <span className="text-navy dark:text-white/80">
        {toDateInput(value) || '-'}
      </span>
    );
  }
  return <span className="text-navy dark:text-white/80">{String(value)}</span>;
}

function buildDraftFromRow(
  row: Record<string, unknown>,
  columns: TrackerManageField[]
): RowDraft {
  const draft: RowDraft = {};
  columns.forEach((field) => {
    if (field.type === 'date') {
      draft[field.key] = toDateInput(row[field.key]);
      return;
    }
    if (field.type === 'boolean') {
      draft[field.key] = toBooleanInput(row[field.key]);
      return;
    }
    draft[field.key] = String(row[field.key] || '');
  });
  return draft;
}

function buildPayloadFromDraft(
  draft: RowDraft,
  columns: TrackerManageField[]
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  columns.forEach((field) => {
    const rawValue = draft[field.key] || '';

    if (field.type === 'boolean') {
      payload[field.key] = rawValue === '' ? null : rawValue === 'true';
      return;
    }

    if (field.type === 'date') {
      payload[field.key] = rawValue || null;
      return;
    }

    const trimmed = rawValue.trim();
    payload[field.key] = trimmed || null;
  });
  return payload;
}

function validateRequiredFields(
  draft: RowDraft,
  columns: TrackerManageField[]
): string | null {
  for (const field of columns) {
    if (!field.required) continue;
    const value = draft[field.key] || '';
    if (field.type === 'boolean') {
      if (value === '') return `${field.label} is required.`;
      continue;
    }
    if (!value.trim()) return `${field.label} is required.`;
  }
  return null;
}

export default function TrackerRowsManagerContent({
  config,
  initialGroupValues,
  canManage,
}: TrackerRowsManagerContentProps) {
  const [groupValues, setGroupValues] = useState<string[]>(initialGroupValues);
  const [selectedGroup, setSelectedGroup] = useState(initialGroupValues[0] || '');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [openActionsRowId, setOpenActionsRowId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [showTopScrollbar, setShowTopScrollbar] = useState(false);
  const topScrollbarRef = useRef<HTMLDivElement | null>(null);
  const topScrollbarSpacerRef = useRef<HTMLDivElement | null>(null);
  const tableScrollerRef = useRef<HTMLDivElement | null>(null);

  const groupField = config.groupBy.field;
  const groupQueryParam = config.groupBy.queryParam;

  const createEmptyDraft = (groupValue = ''): RowDraft => {
    const draft: RowDraft = {};
    config.columns.forEach((field) => {
      draft[field.key] = '';
    });
    if (groupField) {
      draft[groupField] = groupValue;
    }
    return draft;
  };

  const [newDraft, setNewDraft] = useState<RowDraft>(
    createEmptyDraft(initialGroupValues[0] || '')
  );

  const sortedGroupValues = useMemo(
    () =>
      Array.from(new Set(groupValues.map((value) => value.trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [groupValues]
  );

  const loadRows = async (groupValue = selectedGroup) => {
    if (!groupValue) {
      setRows([]);
      setDrafts({});
      setOpenActionsRowId(null);
      return;
    }

    setLoading(true);
    setErrorText(null);

    try {
      const params = new URLSearchParams({
        type: config.trackerType,
        limit: '1000',
        offset: '0',
      });
      params.set(groupQueryParam, groupValue);

      const res = await fetch(`/api/performance/tracker?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load rows');
      }

      const payload = json.data || json;
      const nextRows = payload.rows || [];
      setRows(nextRows);

      const nextDrafts: Record<string, RowDraft> = {};
      for (const row of nextRows) {
        if (!row.id) continue;
        nextDrafts[String(row.id)] = buildDraftFromRow(
          row as Record<string, unknown>,
          config.columns
        );
      }
      setDrafts(nextDrafts);
      setOpenActionsRowId(null);
      setNewDraft((prev) => ({ ...prev, [groupField]: groupValue }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load rows';
      setErrorText(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedGroup) {
      loadRows(selectedGroup);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, config.trackerType]);

  const syncTopScrollbarMetrics = useCallback(() => {
    const tableScroller = tableScrollerRef.current;
    const topSpacer = topScrollbarSpacerRef.current;
    const topScroller = topScrollbarRef.current;
    if (!tableScroller) return;

    const hasOverflow = tableScroller.scrollWidth > tableScroller.clientWidth + 2;
    setShowTopScrollbar(hasOverflow);
    if (topSpacer) {
      topSpacer.style.width = `${tableScroller.scrollWidth}px`;
    }

    if (topScroller) {
      if (!hasOverflow) {
        topScroller.scrollLeft = 0;
      } else {
        topScroller.scrollLeft = tableScroller.scrollLeft;
      }
    }
  }, []);

  useEffect(() => {
    syncTopScrollbarMetrics();
  }, [
    syncTopScrollbarMetrics,
    rows,
    loading,
    selectedGroup,
    openActionsRowId,
    canManage,
    config.columns.length,
    showTopScrollbar,
  ]);

  useEffect(() => {
    const onResize = () => syncTopScrollbarMetrics();
    window.addEventListener('resize', onResize);

    const tableScroller = tableScrollerRef.current;
    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined' && tableScroller) {
      observer = new ResizeObserver(() => syncTopScrollbarMetrics());
      observer.observe(tableScroller);
      if (tableScroller.firstElementChild instanceof HTMLElement) {
        observer.observe(tableScroller.firstElementChild);
      }
    }

    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [syncTopScrollbarMetrics]);

  useEffect(() => {
    if (!showTopScrollbar) return;
    const topScroller = topScrollbarRef.current;
    const tableScroller = tableScrollerRef.current;
    if (!topScroller || !tableScroller) return;

    let syncingFromTop = false;
    let syncingFromBottom = false;

    const onTopScroll = () => {
      if (syncingFromBottom) return;
      syncingFromTop = true;
      tableScroller.scrollLeft = topScroller.scrollLeft;
      syncingFromTop = false;
    };

    const onTableScroll = () => {
      if (syncingFromTop) return;
      syncingFromBottom = true;
      topScroller.scrollLeft = tableScroller.scrollLeft;
      syncingFromBottom = false;
    };

    topScroller.addEventListener('scroll', onTopScroll);
    tableScroller.addEventListener('scroll', onTableScroll);
    topScroller.scrollLeft = tableScroller.scrollLeft;

    return () => {
      topScroller.removeEventListener('scroll', onTopScroll);
      tableScroller.removeEventListener('scroll', onTableScroll);
    };
  }, [showTopScrollbar]);

  const updateDraft = (rowId: string, key: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [rowId]: {
        ...(prev[rowId] || createEmptyDraft(selectedGroup)),
        [key]: value,
      },
    }));
  };

  const saveRow = async (rowId: string) => {
    const draft = drafts[rowId];
    if (!draft) return;

    const validationError = validateRequiredFields(draft, config.columns);
    if (validationError) {
      setErrorText(validationError);
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
          type: config.trackerType,
          id: rowId,
          patch: buildPayloadFromDraft(draft, config.columns),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save row');
      }

      const updatedGroupValue = (draft[groupField] || '').trim();
      if (
        updatedGroupValue &&
        !sortedGroupValues.includes(updatedGroupValue)
      ) {
        setGroupValues((prev) => [...prev, updatedGroupValue]);
      }

      setStatusText('Row saved.');
      setOpenActionsRowId(null);
      await loadRows(selectedGroup);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save row';
      setErrorText(msg);
    } finally {
      setSavingRowId(null);
    }
  };

  const createRow = async () => {
    const validationError = validateRequiredFields(newDraft, config.columns);
    if (validationError) {
      setErrorText(validationError);
      return;
    }

    setCreating(true);
    setErrorText(null);
    setStatusText(null);

    try {
      const payload = buildPayloadFromDraft(newDraft, config.columns);
      const res = await fetch('/api/performance/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: config.trackerType,
          row: {
            ...payload,
            source_tab: 'manual_ui',
            source_row: null,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to add row');
      }

      const nextGroupValue = String(newDraft[groupField] || '').trim();
      if (nextGroupValue && !sortedGroupValues.includes(nextGroupValue)) {
        setGroupValues((prev) => [...prev, nextGroupValue]);
      }

      setSelectedGroup(nextGroupValue);
      setNewDraft(createEmptyDraft(nextGroupValue));
      setStatusText('Row added.');
      await loadRows(nextGroupValue);
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
          type: config.trackerType,
          id: rowId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete row');
      }

      setStatusText('Row deleted.');
      setOpenActionsRowId(null);
      await loadRows(selectedGroup);
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
          <h2 className="text-sm font-semibold text-navy dark:text-white">
            {config.groupBy.label}
          </h2>
          <p className="text-xs text-navy/50 dark:text-white/40 mt-1">
            Select a {config.groupBy.itemLabel} to manage {config.label} rows.
          </p>

          {sortedGroupValues.length === 0 ? (
            <p className="text-xs text-navy/50 dark:text-white/40 mt-3">
              No {config.groupBy.itemLabel}s found yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-3">
              {sortedGroupValues.map((groupValue) => (
                <button
                  key={groupValue}
                  onClick={() => setSelectedGroup(groupValue)}
                  className={`px-3 py-2 rounded-lg text-xs text-left border transition-colors ${
                    selectedGroup === groupValue
                      ? 'bg-electric text-white border-electric'
                      : 'bg-white dark:bg-white/5 border-cream-dark/70 dark:border-white/15 text-navy dark:text-white hover:border-electric/40'
                  }`}
                >
                  {groupValue}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-navy dark:text-white">
              {selectedGroup
                ? `${config.label} - ${selectedGroup}`
                : config.label}
            </h3>
            <button
              onClick={() => loadRows(selectedGroup)}
              disabled={loading || !selectedGroup}
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

          {showTopScrollbar && (
            <div
              ref={topScrollbarRef}
              className="mb-2 overflow-x-auto overflow-y-hidden border border-cream-dark/50 dark:border-white/10 rounded-lg"
              aria-label="Top horizontal scroll"
            >
              <div ref={topScrollbarSpacerRef} className="h-4 min-w-full" />
            </div>
          )}

          <div
            ref={tableScrollerRef}
            className="overflow-x-auto border border-cream-dark/50 dark:border-white/10 rounded-lg"
          >
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-cream-dark/20 dark:bg-white/5 border-b border-cream-dark/40 dark:border-white/10">
                  {config.columns.map((field) => (
                    <th
                      key={field.key}
                      className="text-left px-2 py-2 font-medium text-navy/60 dark:text-white/50"
                    >
                      {field.label}
                    </th>
                  ))}
                  {canManage && (
                    <th className="text-right px-2 py-2 font-medium text-navy/60 dark:text-white/50">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {canManage && (
                  <tr className="bg-blue-50/70 dark:bg-blue-500/10 border-b border-cream-dark/30 dark:border-white/5">
                    {config.columns.map((field) => (
                      <td
                        key={`new-${field.key}`}
                        className={`px-2 py-2 ${getFieldWidthClass(field)}`}
                      >
                        {field.type === 'boolean' ? (
                          <select
                            value={newDraft[field.key] || ''}
                            onChange={(e) =>
                              setNewDraft((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            className={INPUT_CLASS}
                          >
                            <option value="">-</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ) : field.type === 'date' ? (
                          <input
                            type="date"
                            value={newDraft[field.key] || ''}
                            onChange={(e) =>
                              setNewDraft((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            className={INPUT_CLASS}
                          />
                        ) : field.type === 'textarea' ? (
                          <textarea
                            value={newDraft[field.key] || ''}
                            onChange={(e) =>
                              setNewDraft((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            className={TEXTAREA_CLASS}
                          />
                        ) : (
                          <input
                            value={newDraft[field.key] || ''}
                            onChange={(e) =>
                              setNewDraft((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            className={INPUT_CLASS}
                          />
                        )}
                      </td>
                    ))}
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
                    <td
                      colSpan={canManage ? config.columns.length + 1 : config.columns.length}
                      className="px-2 py-4 text-center text-xs text-navy/50 dark:text-white/40"
                    >
                      {selectedGroup
                        ? `No rows for this ${config.groupBy.itemLabel}.`
                        : `Select a ${config.groupBy.itemLabel}.`}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const rowId = row.id ? String(row.id) : '';
                    const draft = rowId
                      ? drafts[rowId] || buildDraftFromRow(row, config.columns)
                      : buildDraftFromRow(row, config.columns);
                    const isSaving = savingRowId === rowId;
                    const isDeleting = deletingRowId === rowId;

                    return (
                      <tr
                        key={rowId || `row-${idx}`}
                        className="border-b border-cream-dark/30 dark:border-white/5 last:border-0"
                      >
                        {config.columns.map((field) => (
                          <td
                            key={`${rowId}-${field.key}`}
                            className={`px-2 py-2 ${getFieldWidthClass(field)}`}
                          >
                            {canManage ? (
                              field.type === 'boolean' ? (
                                <select
                                  value={draft[field.key] || ''}
                                  onChange={(e) =>
                                    rowId && updateDraft(rowId, field.key, e.target.value)
                                  }
                                  className={INPUT_CLASS}
                                >
                                  <option value="">-</option>
                                  <option value="true">Yes</option>
                                  <option value="false">No</option>
                                </select>
                              ) : field.type === 'date' ? (
                                <input
                                  type="date"
                                  value={draft[field.key] || ''}
                                  onChange={(e) =>
                                    rowId && updateDraft(rowId, field.key, e.target.value)
                                  }
                                  className={INPUT_CLASS}
                                />
                              ) : field.type === 'textarea' ? (
                                <textarea
                                  value={draft[field.key] || ''}
                                  onChange={(e) =>
                                    rowId && updateDraft(rowId, field.key, e.target.value)
                                  }
                                  className={TEXTAREA_CLASS}
                                />
                              ) : (
                                <input
                                  value={draft[field.key] || ''}
                                  onChange={(e) =>
                                    rowId && updateDraft(rowId, field.key, e.target.value)
                                  }
                                  className={INPUT_CLASS}
                                />
                              )
                            ) : (
                              renderReadOnlyCell(row, field)
                            )}
                          </td>
                        ))}
                        {canManage && (
                          <td className="px-2 py-2 text-right min-w-[120px]">
                            {rowId ? (
                              <div className="relative inline-flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenActionsRowId((current) =>
                                      current === rowId ? null : rowId
                                    )
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
                              <span className="text-[11px] text-navy/40 dark:text-white/30">
                                No ID
                              </span>
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
