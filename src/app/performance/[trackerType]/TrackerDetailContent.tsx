'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PK_TRACKER_FREQUENCIES, PKTrackerType } from '@/lib/types';

interface TrackerDetailContentProps {
  trackerType: PKTrackerType;
  label: string;
}

type ColumnType = 'date' | 'boolean' | 'link' | 'text';

interface EditableColumn {
  key: string;
  label: string;
  type: ColumnType;
}

interface EditableRow {
  id: string;
  values: Record<string, string>;
}

interface TrackerStoragePayload {
  version: 1;
  trackerType: string;
  columns: EditableColumn[];
  rows: EditableRow[];
  settings: {
    columnCounter: number;
    rowCounter: number;
  };
  sync: {
    lastLoadedAt: string;
    lastSavedAt: string;
    source: 'local' | 'api_seed' | 'empty_seed';
  };
}

const TRACKER_STORAGE_NAMESPACES: Partial<Record<PKTrackerType, string>> = {
  fathom_videos: 'tracker:fathom_videos',
  google_ads_reports: 'tracker:google_ads_reports',
  pingdom_tests: 'tracker:pingdom_tests',
};

const TRACKER_COLUMNS: Record<
  string,
  Array<{ key: string; label: string; type?: 'date' | 'boolean' | 'link' }>
> = {
  fathom_videos: [
    { key: 'account_manager_name', label: 'AM' },
    { key: 'client_name', label: 'Client' },
    { key: 'meeting_date', label: 'Meeting Date', type: 'date' },
    { key: 'watched', label: 'Watched', type: 'boolean' },
    { key: 'action_items_sent', label: 'Action Items', type: 'boolean' },
    { key: 'fathom_video_link', label: 'Link', type: 'link' },
  ],
  client_updates: [
    { key: 'account_manager_name', label: 'AM' },
    { key: 'client_name', label: 'Client' },
    { key: 'meeting_date', label: 'Date Sent', type: 'date' },
    { key: 'on_time', label: 'On Time', type: 'boolean' },
    { key: 'method', label: 'Method' },
    { key: 'notes', label: 'Notes' },
  ],
  ticket_updates: [
    { key: 'month_label', label: 'Month' },
    { key: 'client_type', label: 'Type' },
    { key: 'client_name', label: 'Client' },
    { key: 'updated', label: 'Updated', type: 'boolean' },
    { key: 'report_timeframe', label: 'Timeframe' },
    { key: 'report_attachment', label: 'Report', type: 'link' },
  ],
  daily_goals: [
    { key: 'entry_date', label: 'Date', type: 'date' },
    { key: 'designer_dev', label: 'Person' },
    { key: 'commitment', label: 'Commitment' },
    { key: 'completed', label: 'Done', type: 'boolean' },
    { key: 'percent', label: '%' },
    { key: 'remarks', label: 'Remarks' },
  ],
  sanity_checks: [
    { key: 'account_manager_name', label: 'AM' },
    { key: 'check_date', label: 'Date', type: 'date' },
    { key: 'client_name', label: 'Client' },
    { key: 'business_name', label: 'Business' },
    { key: 'sanity_check_done', label: 'Done', type: 'boolean' },
    { key: 'notes', label: 'Notes' },
  ],
  sanity_tests: [
    { key: 'account_manager_name', label: 'AM' },
    { key: 'test_date', label: 'Date', type: 'date' },
    { key: 'client_name', label: 'Client' },
    { key: 'website', label: 'Website' },
    { key: 'test_done', label: 'Test Done', type: 'boolean' },
    { key: 'email_received', label: 'Email Recv', type: 'boolean' },
    { key: 'form_link', label: 'Form', type: 'link' },
  ],
  pics_monitoring: [
    { key: 'account_manager_name', label: 'AM' },
    { key: 'week_label', label: 'Week' },
    { key: 'check_date', label: 'Date', type: 'date' },
    { key: 'client_name', label: 'Client' },
    { key: 'duration', label: 'Duration' },
    { key: 'notes', label: 'Notes' },
  ],
  flagged_tickets: [
    { key: 'team_type', label: 'Team' },
    { key: 'date_range', label: 'Date Range' },
    { key: 'person_name', label: 'Person' },
    { key: 'project_ticket_id', label: 'Ticket' },
    { key: 'red_flag_type', label: 'Flag Type' },
    { key: 'ticket_count', label: 'Count' },
    { key: 'reasonable', label: 'Reasonable', type: 'boolean' },
    { key: 'description', label: 'Description' },
  ],
  pingdom_tests: [
    { key: 'account_manager_name', label: 'AM' },
    { key: 'test_date', label: 'Date', type: 'date' },
    { key: 'client_name', label: 'Client' },
    { key: 'client_website', label: 'Website' },
    { key: 'report_attachment', label: 'Report', type: 'link' },
    { key: 'quarter_label', label: 'Quarter' },
  ],
  update_schedule: [
    { key: 'account_manager_name', label: 'AM' },
    { key: 'client_name', label: 'Client' },
    { key: 'preferred_time', label: 'Preferred Time' },
    { key: 'notes', label: 'Notes' },
  ],
  website_status: [
    { key: 'account_manager_name', label: 'AM' },
    { key: 'client_name', label: 'Client' },
    { key: 'business_name', label: 'Business' },
    { key: 'website_link', label: 'Website', type: 'link' },
    { key: 'status', label: 'Status' },
    { key: 'notes', label: 'Notes' },
  ],
  google_ads_reports: [
    { key: 'month_label', label: 'Month' },
    { key: 'raw_content', label: 'Report Details' },
  ],
  monthly_summaries: [
    { key: 'month_label', label: 'Month' },
    { key: 'summary', label: 'Summary' },
    { key: 'notes', label: 'Notes' },
  ],
  weekly_tickets: [
    { key: 'team_type', label: 'Team' },
    { key: 'week_label', label: 'Week' },
    { key: 'person_name', label: 'Person' },
    { key: 'ticket_count', label: 'Ticket Count' },
    { key: 'notes', label: 'Notes' },
  ],
  holiday_tracking: [
    { key: 'holiday_name', label: 'Holiday' },
    { key: 'holiday_date', label: 'Date', type: 'date' },
    { key: 'notes', label: 'Notes' },
  ],
  google_analytics_status: [
    { key: 'client_name', label: 'Client' },
    { key: 'status', label: 'Status' },
    { key: 'notes', label: 'Notes' },
  ],
  other_activities: [
    { key: 'activity', label: 'Activity' },
    { key: 'owner', label: 'Owner' },
    { key: 'notes', label: 'Notes' },
  ],
};

const NON_DISPLAY_KEYS = new Set(['id', 'created_at', 'updated_at']);

function toDisplayLabel(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toEditableColumns(
  columns: Array<{ key: string; label: string; type?: 'date' | 'boolean' | 'link' }>
): EditableColumn[] {
  return columns.map((column) => ({
    key: column.key,
    label: column.label,
    type: column.type || 'text',
  }));
}

function normalizeColumnsForTracker(
  trackerType: PKTrackerType,
  columns: EditableColumn[]
): EditableColumn[] {
  if (trackerType !== 'client_updates') return columns;
  return columns.map((column) => {
    if (
      column.key === 'meeting_date' &&
      (column.label === 'Meeting Date' || column.label === 'Date of Meeting')
    ) {
      return { ...column, label: 'Date Sent' };
    }
    return column;
  });
}

function buildEmptyRow(columns: EditableColumn[], id: string): EditableRow {
  const values: Record<string, string> = {};
  for (const column of columns) values[column.key] = '';
  return { id, values };
}

export default function TrackerDetailContent({
  trackerType,
  label,
}: TrackerDetailContentProps) {
  const storageKey = TRACKER_STORAGE_NAMESPACES[trackerType] || `tracker:${trackerType}`;
  const frequency = PK_TRACKER_FREQUENCIES[trackerType] || '';

  const [columns, setColumns] = useState<EditableColumn[]>([]);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [columnCounter, setColumnCounter] = useState(1);
  const [rowCounter, setRowCounter] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string>('');
  const [lastSavedAt, setLastSavedAt] = useState<string>('');
  const [syncSource, setSyncSource] = useState<'local' | 'api_seed' | 'empty_seed'>(
    'empty_seed'
  );
  const [hydrated, setHydrated] = useState(false);

  const persistState = useCallback(
    (
      nextColumns: EditableColumn[],
      nextRows: EditableRow[],
      nextColumnCounter: number,
      nextRowCounter: number,
      source: 'local' | 'api_seed' | 'empty_seed',
      loadedAt: string
    ) => {
      const now = new Date().toISOString();
      const payload: TrackerStoragePayload = {
        version: 1,
        trackerType,
        columns: nextColumns,
        rows: nextRows,
        settings: {
          columnCounter: nextColumnCounter,
          rowCounter: nextRowCounter,
        },
        sync: {
          lastLoadedAt: loadedAt,
          lastSavedAt: now,
          source,
        },
      };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
      setLastSavedAt(now);
    },
    [storageKey, trackerType]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHydrated(false);
    setErrorText(null);

    const load = async () => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<TrackerStoragePayload>;
          if (
            parsed &&
            Array.isArray(parsed.columns) &&
            Array.isArray(parsed.rows) &&
            parsed.settings
          ) {
            if (cancelled) return;
            setColumns(
              normalizeColumnsForTracker(
                trackerType,
                parsed.columns as EditableColumn[]
              )
            );
            setRows(parsed.rows as EditableRow[]);
            setColumnCounter(parsed.settings.columnCounter || 1);
            setRowCounter(parsed.settings.rowCounter || 1);
            setLastLoadedAt(parsed.sync?.lastLoadedAt || new Date().toISOString());
            setLastSavedAt(parsed.sync?.lastSavedAt || '');
            setSyncSource('local');
            setHydrated(true);
            setLoading(false);
            return;
          }
        }

        const res = await fetch(
          `/api/performance/tracker?type=${trackerType}&limit=200&offset=0`
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        const now = new Date().toISOString();
        const source: 'api_seed' | 'empty_seed' = res.ok ? 'api_seed' : 'empty_seed';
        const payload = json.data || json;
        const apiRows: Record<string, unknown>[] = Array.isArray(payload?.rows)
          ? payload.rows
          : [];

        let initialColumns = TRACKER_COLUMNS[trackerType]
          ? toEditableColumns(TRACKER_COLUMNS[trackerType])
          : [];

        if (initialColumns.length === 0 && apiRows.length > 0) {
          const keys = Object.keys(apiRows[0]).filter((key) => !NON_DISPLAY_KEYS.has(key));
          initialColumns = keys.map((key) => ({
            key,
            label: toDisplayLabel(key),
            type: 'text',
          }));
        }
        if (initialColumns.length === 0) {
          initialColumns = [{ key: 'notes', label: 'Notes', type: 'text' }];
        }
        initialColumns = normalizeColumnsForTracker(trackerType, initialColumns);

        const initialRows: EditableRow[] =
          apiRows.length > 0
            ? apiRows.map((apiRow, idx) => {
                const nextValues: Record<string, string> = {};
                for (const column of initialColumns) {
                  const value = apiRow[column.key];
                  nextValues[column.key] =
                    value === null || value === undefined ? '' : String(value);
                }
                return {
                  id: String(apiRow.id || `${trackerType}_row_${idx + 1}`),
                  values: nextValues,
                };
              })
            : [buildEmptyRow(initialColumns, `${trackerType}_row_1`)];

        const nextColumnCounter = Math.max(
          1,
          initialColumns.filter((column) => column.key.startsWith('column_')).length + 1
        );
        const nextRowCounter = Math.max(1, initialRows.length + 1);

        setColumns(initialColumns);
        setRows(initialRows);
        setColumnCounter(nextColumnCounter);
        setRowCounter(nextRowCounter);
        setLastLoadedAt(now);
        setLastSavedAt('');
        setSyncSource(source);
        setHydrated(true);
        persistState(
          initialColumns,
          initialRows,
          nextColumnCounter,
          nextRowCounter,
          source,
          now
        );
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Failed to initialize tracker storage.';
        setErrorText(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [persistState, storageKey, trackerType]);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      persistState(
        columns,
        rows,
        columnCounter,
        rowCounter,
        syncSource,
        lastLoadedAt || new Date().toISOString()
      );
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    columns,
    rows,
    columnCounter,
    rowCounter,
    hydrated,
    persistState,
    syncSource,
    lastLoadedAt,
  ]);

  const addColumn = useCallback(() => {
    const key = `column_${columnCounter}`;
    const nextColumns = [...columns, { key, label: `Column ${columnCounter}`, type: 'text' as const }];
    const nextRows = rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        [key]: '',
      },
    }));
    setColumns(nextColumns);
    setRows(nextRows);
    setColumnCounter((current) => current + 1);
  }, [columnCounter, columns, rows]);

  const removeColumn = useCallback(
    (columnKey: string) => {
      const nextColumns = columns.filter((column) => column.key !== columnKey);
      const safeColumns = nextColumns.length > 0 ? nextColumns : [{ key: 'notes', label: 'Notes', type: 'text' as const }];
      const nextRows = rows.map((row) => {
        const nextValues = { ...row.values };
        delete nextValues[columnKey];
        if (safeColumns.length === 1 && safeColumns[0].key === 'notes' && !Object.prototype.hasOwnProperty.call(nextValues, 'notes')) {
          nextValues.notes = '';
        }
        return { ...row, values: nextValues };
      });
      setColumns(safeColumns);
      setRows(nextRows);
    },
    [columns, rows]
  );

  const renameColumn = useCallback((columnKey: string, nextLabel: string) => {
    setColumns((current) =>
      current.map((column) =>
        column.key === columnKey ? { ...column, label: nextLabel } : column
      )
    );
  }, []);

  const addRow = useCallback(() => {
    const rowId = `${trackerType}_row_${rowCounter}`;
    setRows((current) => [...current, buildEmptyRow(columns, rowId)]);
    setRowCounter((current) => current + 1);
  }, [columns, rowCounter, trackerType]);

  const removeRow = useCallback((rowId: string) => {
    setRows((current) => current.filter((row) => row.id !== rowId));
  }, []);

  const updateCell = useCallback((rowId: string, columnKey: string, value: string) => {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? { ...row, values: { ...row.values, [columnKey]: value } }
          : row
      )
    );
  }, []);

  const syncText = useMemo(() => {
    if (!lastSavedAt) return 'Not saved yet';
    return `Last saved ${new Date(lastSavedAt).toLocaleString()}`;
  }, [lastSavedAt]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/performance"
              className="text-navy/50 dark:text-white/40 hover:text-electric transition-colors"
            >
              Performance Hub
            </Link>
            <span className="text-navy/30 dark:text-white/20">/</span>
            <span className="text-navy dark:text-white font-medium">{label}</span>
          </div>
          <div className="flex items-center gap-3">
            {frequency && (
              <span className="text-xs px-2 py-1 rounded-full bg-electric/10 text-electric font-medium">
                {frequency}
              </span>
            )}
            <span className="text-xs text-navy/50 dark:text-white/40">
              {rows.length.toLocaleString()} rows
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-white/5 rounded-xl border border-cream-dark/60 dark:border-white/10 p-3">
          <button
            onClick={addRow}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-electric text-white hover:bg-electric/90 transition-colors"
          >
            Add Row
          </button>
          <button
            onClick={addColumn}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors"
          >
            Add Column
          </button>
          <button
            onClick={() =>
              persistState(
                columns,
                rows,
                columnCounter,
                rowCounter,
                syncSource,
                lastLoadedAt || new Date().toISOString()
              )
            }
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors"
          >
            Save Now
          </button>
          <span className="text-xs text-navy/50 dark:text-white/40">
            Key: <code>{storageKey}</code>
          </span>
          <span className="text-xs text-navy/40 dark:text-white/30">{syncText}</span>
          {lastLoadedAt && (
            <span className="text-xs text-navy/40 dark:text-white/30">
              Loaded {new Date(lastLoadedAt).toLocaleString()} ({syncSource})
            </span>
          )}
        </div>

        {errorText && (
          <div className="px-3 py-2 rounded-lg text-xs border border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {errorText}
          </div>
        )}

        <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4].map((idx) => (
                <div
                  key={idx}
                  className="animate-pulse h-8 rounded bg-cream-dark/40 dark:bg-white/10"
                />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-dark/60 dark:border-white/10 bg-cream-dark/20 dark:bg-white/5">
                    {columns.map((column) => (
                      <th key={column.key} className="text-left py-2 px-3 min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <input
                            value={column.label}
                            onChange={(event) => renameColumn(column.key, event.target.value)}
                            className="w-full px-2 py-1 rounded border border-cream-dark dark:border-white/10 bg-white dark:bg-white/5 text-xs text-navy dark:text-white"
                          />
                          <button
                            onClick={() => removeColumn(column.key)}
                            className="px-2 py-1 rounded text-[11px] border border-cream-dark dark:border-white/10 text-navy/70 dark:text-white/70 hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors"
                            title={`Remove ${column.label}`}
                          >
                            Remove
                          </button>
                        </div>
                      </th>
                    ))}
                    <th className="text-left py-2 px-3 min-w-[90px]">
                      <span className="text-xs font-medium text-navy/60 dark:text-white/50">
                        Row
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-cream-dark/30 dark:border-white/5 last:border-0 hover:bg-cream-dark/10 dark:hover:bg-white/5 transition-colors"
                    >
                      {columns.map((column) => (
                        <td key={`${row.id}_${column.key}`} className="py-2 px-3">
                          <EditableCell
                            type={column.type}
                            value={row.values[column.key] || ''}
                            onChange={(nextValue) =>
                              updateCell(row.id, column.key, nextValue)
                            }
                          />
                        </td>
                      ))}
                      <td className="py-2 px-3">
                        <button
                          onClick={() => removeRow(row.id)}
                          className="px-2 py-1 rounded text-[11px] border border-cream-dark dark:border-white/10 text-navy/70 dark:text-white/70 hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={columns.length + 1}
                        className="py-8 px-3 text-center text-sm text-navy/50 dark:text-white/40"
                      >
                        No rows yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditableCell({
  type,
  value,
  onChange,
}: {
  type: ColumnType;
  value: string;
  onChange: (value: string) => void;
}) {
  if (type === 'boolean') {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-2 py-1 rounded border border-cream-dark dark:border-white/10 bg-white dark:bg-white/5 text-xs text-navy dark:text-white"
      >
        <option value="">-</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  if (type === 'date') {
    return (
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-2 py-1 rounded border border-cream-dark dark:border-white/10 bg-white dark:bg-white/5 text-xs text-navy dark:text-white"
      />
    );
  }

  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full px-2 py-1 rounded border border-cream-dark dark:border-white/10 bg-white dark:bg-white/5 text-xs text-navy dark:text-white"
      placeholder={type === 'link' ? 'https://...' : ''}
    />
  );
}
