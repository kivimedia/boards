'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    manualAMTabs?: string[];
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
    { key: 'date_watched', label: 'Date Watched', type: 'date' },
    { key: 'action_items_sent', label: 'Action Items', type: 'boolean' },
    { key: 'fathom_video_link', label: 'Fathom Link', type: 'link' },
    { key: 'notes', label: 'Notes' },
  ],
  client_updates: [
    { key: 'account_manager_name', label: 'AM' },
    { key: 'client_name', label: 'Client' },
    { key: 'meeting_date', label: 'Meeting Date', type: 'date' },
    { key: 'date_sent', label: 'Date Sent', type: 'date' },
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
const AM_TABBED_TRACKERS = new Set<PKTrackerType>(['fathom_videos', 'client_updates']);
const FATHOM_AM_KEY = 'account_manager_name';
const FATHOM_MEETING_DATE_KEY = 'meeting_date';
const DATA_COLUMN_WIDTH = 220;
const ACTION_COLUMN_WIDTH = 96;
const FATHOM_REQUIRED_COLUMNS: EditableColumn[] = [
  { key: 'account_manager_name', label: 'AM', type: 'text' },
  { key: 'client_name', label: 'Client', type: 'text' },
  { key: 'meeting_date', label: 'Meeting Date', type: 'date' },
  { key: 'date_watched', label: 'Date Watched', type: 'date' },
  { key: 'action_items_sent', label: 'Action Items', type: 'boolean' },
  { key: 'fathom_video_link', label: 'Fathom Link', type: 'link' },
  { key: 'notes', label: 'Notes', type: 'text' },
];
const FATHOM_LEGACY_COLUMNS = new Set(['watched', 'attachments']);
const CLIENT_UPDATES_REQUIRED_COLUMNS: EditableColumn[] = [
  { key: 'account_manager_name', label: 'AM', type: 'text' },
  { key: 'client_name', label: 'Client', type: 'text' },
  { key: 'meeting_date', label: 'Meeting Date', type: 'date' },
  { key: 'date_sent', label: 'Date Sent', type: 'date' },
  { key: 'on_time', label: 'On Time', type: 'boolean' },
  { key: 'method', label: 'Method', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'text' },
];

function toDateTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) return null;
  return timestamp;
}

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
  if (trackerType === 'client_updates') {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const normalized = CLIENT_UPDATES_REQUIRED_COLUMNS.map((requiredColumn) => {
      const existing = byKey.get(requiredColumn.key);
      return {
        key: requiredColumn.key,
        label: requiredColumn.label,
        type: existing?.type || requiredColumn.type,
      };
    });
    const extraColumns = columns.filter(
      (column) =>
        !CLIENT_UPDATES_REQUIRED_COLUMNS.some((required) => required.key === column.key)
    );
    return [...normalized, ...extraColumns];
  }

  if (trackerType === 'fathom_videos') {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const normalized = FATHOM_REQUIRED_COLUMNS.map((requiredColumn) => {
      const existing = byKey.get(requiredColumn.key);
      return {
        key: requiredColumn.key,
        label: requiredColumn.label,
        type: existing?.type || requiredColumn.type,
      };
    });
    const extraColumns = columns.filter(
      (column) =>
        !FATHOM_REQUIRED_COLUMNS.some((required) => required.key === column.key) &&
        !FATHOM_LEGACY_COLUMNS.has(column.key)
    );
    return [...normalized, ...extraColumns];
  }

  return columns;
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
  const [selectedAM, setSelectedAM] = useState('');
  const [showColumnActionsMenu, setShowColumnActionsMenu] = useState(false);
  const [showRemoveColumnMenu, setShowRemoveColumnMenu] = useState(false);
  const [openRowActionsRowId, setOpenRowActionsRowId] = useState<string | null>(null);
  const [rowUndoValues, setRowUndoValues] = useState<Record<string, Record<string, string>>>({});
  const [manualAMTabs, setManualAMTabs] = useState<string[]>([]);
  const [showAddAMInput, setShowAddAMInput] = useState(false);
  const [newAMName, setNewAMName] = useState('');
  const [amInputError, setAMInputError] = useState<string | null>(null);
  const [showMidScrollbar, setShowMidScrollbar] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [savedToastTick, setSavedToastTick] = useState(0);
  const headerScrollerRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollerRef = useRef<HTMLDivElement | null>(null);
  const midScrollbarRef = useRef<HTMLDivElement | null>(null);
  const midScrollbarSpacerRef = useRef<HTMLDivElement | null>(null);

  const isFathomTracker = trackerType === 'fathom_videos';
  const isAMTabbedTracker = AM_TABBED_TRACKERS.has(trackerType);

  const amTabs = useMemo(() => {
    if (!isAMTabbedTracker) return [] as string[];
    const namesFromRows = rows
      .map((row) => String(row.values[FATHOM_AM_KEY] || '').trim())
      .filter(Boolean);
    const manualNames = isFathomTracker ? manualAMTabs : [];
    return Array.from(new Set([...manualNames, ...namesFromRows]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [isAMTabbedTracker, isFathomTracker, manualAMTabs, rows]);

  useEffect(() => {
    if (!isAMTabbedTracker) return;
    if (amTabs.length === 0) {
      if (selectedAM) setSelectedAM('');
      return;
    }
    if (!selectedAM || !amTabs.includes(selectedAM)) {
      setSelectedAM(amTabs[0]);
    }
  }, [amTabs, isAMTabbedTracker, selectedAM]);

  const visibleRows = useMemo(() => {
    const filteredRows = !isAMTabbedTracker || !selectedAM
      ? rows
      : rows.filter(
          (row) => String(row.values[FATHOM_AM_KEY] || '').trim() === selectedAM
        );

    if (!isFathomTracker) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const aDate = toDateTimestamp(String(a.values[FATHOM_MEETING_DATE_KEY] || ''));
      const bDate = toDateTimestamp(String(b.values[FATHOM_MEETING_DATE_KEY] || ''));

      if (aDate === null && bDate === null) return 0;
      if (aDate === null) return 1;
      if (bDate === null) return -1;
      return bDate - aDate;
    });
  }, [isAMTabbedTracker, isFathomTracker, rows, selectedAM]);

  const syncHorizontalMetrics = useCallback(() => {
    const bodyScroller = bodyScrollerRef.current;
    const headerScroller = headerScrollerRef.current;
    const midScrollbar = midScrollbarRef.current;
    const midSpacer = midScrollbarSpacerRef.current;
    if (!bodyScroller) return;

    const hasOverflow = bodyScroller.scrollWidth > bodyScroller.clientWidth + 2;
    setShowMidScrollbar(hasOverflow);
    if (midSpacer) {
      midSpacer.style.width = `${bodyScroller.scrollWidth}px`;
    }
    if (headerScroller) {
      headerScroller.scrollLeft = bodyScroller.scrollLeft;
    }
    if (midScrollbar) {
      midScrollbar.scrollLeft = hasOverflow ? bodyScroller.scrollLeft : 0;
    }
  }, []);

  const persistState = useCallback(
    (
      nextColumns: EditableColumn[],
      nextRows: EditableRow[],
      nextColumnCounter: number,
      nextRowCounter: number,
      source: 'local' | 'api_seed' | 'empty_seed',
      loadedAt: string,
      nextManualAMTabs: string[]
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
          manualAMTabs: nextManualAMTabs,
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
            const parsedManualTabs = Array.isArray(parsed.settings.manualAMTabs)
              ? parsed.settings.manualAMTabs
                  .map((item) => String(item || '').trim())
                  .filter(Boolean)
              : [];
            setManualAMTabs(parsedManualTabs);
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
                  let value = apiRow[column.key];
                  if (trackerType === 'client_updates') {
                    if (
                      (value === null || value === undefined || value === '') &&
                      column.key === 'meeting_date'
                    ) {
                      value = apiRow.meeting_date ?? apiRow.date_sent;
                    }
                    if (
                      (value === null || value === undefined || value === '') &&
                      column.key === 'date_sent'
                    ) {
                      value = apiRow.date_sent ?? apiRow.meeting_date;
                    }
                  }
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
        setManualAMTabs([]);
        setRowUndoValues({});
        setOpenRowActionsRowId(null);
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
          now,
          []
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
        lastLoadedAt || new Date().toISOString(),
        manualAMTabs
      );
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    columns,
    rows,
    manualAMTabs,
    columnCounter,
    rowCounter,
    hydrated,
    persistState,
    syncSource,
    lastLoadedAt,
  ]);

  useEffect(() => {
    syncHorizontalMetrics();
  }, [syncHorizontalMetrics, columns.length, visibleRows.length, loading, showMidScrollbar]);

  useEffect(() => {
    const onResize = () => syncHorizontalMetrics();
    window.addEventListener('resize', onResize);

    const bodyScroller = bodyScrollerRef.current;
    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== 'undefined' && bodyScroller) {
      observer = new ResizeObserver(() => syncHorizontalMetrics());
      observer.observe(bodyScroller);
      if (bodyScroller.firstElementChild instanceof HTMLElement) {
        observer.observe(bodyScroller.firstElementChild);
      }
    }

    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [syncHorizontalMetrics]);

  useEffect(() => {
    const headerScroller = headerScrollerRef.current;
    const bodyScroller = bodyScrollerRef.current;
    const midScrollbar = midScrollbarRef.current;

    if (!headerScroller || !bodyScroller) return;

    let syncingFrom: 'header' | 'body' | 'mid' | null = null;

    const onHeaderScroll = () => {
      if (syncingFrom && syncingFrom !== 'header') return;
      syncingFrom = 'header';
      bodyScroller.scrollLeft = headerScroller.scrollLeft;
      if (midScrollbar) midScrollbar.scrollLeft = headerScroller.scrollLeft;
      syncingFrom = null;
    };

    const onBodyScroll = () => {
      if (syncingFrom && syncingFrom !== 'body') return;
      syncingFrom = 'body';
      headerScroller.scrollLeft = bodyScroller.scrollLeft;
      if (midScrollbar) midScrollbar.scrollLeft = bodyScroller.scrollLeft;
      syncingFrom = null;
    };

    const onMidScroll = () => {
      if (!midScrollbar) return;
      if (syncingFrom && syncingFrom !== 'mid') return;
      syncingFrom = 'mid';
      bodyScroller.scrollLeft = midScrollbar.scrollLeft;
      headerScroller.scrollLeft = midScrollbar.scrollLeft;
      syncingFrom = null;
    };

    headerScroller.addEventListener('scroll', onHeaderScroll);
    bodyScroller.addEventListener('scroll', onBodyScroll);
    midScrollbar?.addEventListener('scroll', onMidScroll);

    headerScroller.scrollLeft = bodyScroller.scrollLeft;
    if (midScrollbar) midScrollbar.scrollLeft = bodyScroller.scrollLeft;

    return () => {
      headerScroller.removeEventListener('scroll', onHeaderScroll);
      bodyScroller.removeEventListener('scroll', onBodyScroll);
      midScrollbar?.removeEventListener('scroll', onMidScroll);
    };
  }, [showMidScrollbar, columns.length, visibleRows.length, loading]);

  useEffect(() => {
    if (!showSavedToast) return;
    const timeout = window.setTimeout(() => setShowSavedToast(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [showSavedToast, savedToastTick]);

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
      setShowRemoveColumnMenu(false);
      setShowColumnActionsMenu(false);
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
    const newRow = buildEmptyRow(columns, rowId);
    if (isAMTabbedTracker && selectedAM) {
      newRow.values[FATHOM_AM_KEY] = selectedAM;
    }
    setRows((current) => [...current, newRow]);
    setRowCounter((current) => current + 1);
  }, [columns, isAMTabbedTracker, rowCounter, selectedAM, trackerType]);

  const openAddAMInput = useCallback(() => {
    setShowAddAMInput(true);
    setNewAMName('');
    setAMInputError(null);
  }, []);

  const closeAddAMInput = useCallback(() => {
    setShowAddAMInput(false);
    setNewAMName('');
    setAMInputError(null);
  }, []);

  const addAMTab = useCallback(() => {
    const trimmed = newAMName.trim();
    if (!trimmed) {
      setAMInputError('AM name is required.');
      return;
    }

    const existing = amTabs.find(
      (name) => name.toLowerCase() === trimmed.toLowerCase()
    );
    const nextAM = existing || trimmed;

    if (!existing) {
      setManualAMTabs((current) => [...current, trimmed]);
    }

    setSelectedAM(nextAM);
    setShowAddAMInput(false);
    setNewAMName('');
    setAMInputError(null);
  }, [amTabs, newAMName]);

  const removeRow = useCallback((rowId: string) => {
    setRows((current) => current.filter((row) => row.id !== rowId));
    setRowUndoValues((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, rowId)) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    setOpenRowActionsRowId((current) => (current === rowId ? null : current));
  }, []);

  const updateCell = useCallback(
    (rowId: string, columnKey: string, value: string) => {
      const targetRow = rows.find((row) => row.id === rowId);
      if (targetRow) {
        setRowUndoValues((current) => ({
          ...current,
          [rowId]: { ...targetRow.values },
        }));
      }

      setRows((current) =>
        current.map((row) =>
          row.id === rowId
            ? { ...row, values: { ...row.values, [columnKey]: value } }
            : row
        )
      );
    },
    [rows]
  );

  const undoRowChanges = useCallback(
    (rowId: string) => {
      const snapshot = rowUndoValues[rowId];
      if (!snapshot) {
        setOpenRowActionsRowId(null);
        return;
      }
      setRows((current) =>
        current.map((row) =>
          row.id === rowId
            ? { ...row, values: { ...snapshot } }
            : row
        )
      );
      setRowUndoValues((current) => {
        const next = { ...current };
        delete next[rowId];
        return next;
      });
      setOpenRowActionsRowId(null);
    },
    [rowUndoValues]
  );

  const syncText = useMemo(() => {
    if (!lastSavedAt) return 'Not saved yet';
    return `Last saved ${new Date(lastSavedAt).toLocaleString()}`;
  }, [lastSavedAt]);

  const handleSaveNow = useCallback(() => {
    persistState(
      columns,
      rows,
      columnCounter,
      rowCounter,
      syncSource,
      lastLoadedAt || new Date().toISOString(),
      manualAMTabs
    );
    setShowSavedToast(true);
    setSavedToastTick((current) => current + 1);
  }, [
    columnCounter,
    columns,
    lastLoadedAt,
    manualAMTabs,
    persistState,
    rowCounter,
    rows,
    syncSource,
  ]);

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
              {isAMTabbedTracker && selectedAM
                ? `${visibleRows.length.toLocaleString()} rows in ${selectedAM} (${rows.length.toLocaleString()} total)`
                : `${rows.length.toLocaleString()} rows`}
            </span>
          </div>
        </div>

        {isAMTabbedTracker && (
          <div className="bg-white dark:bg-white/5 rounded-xl border border-cream-dark/60 dark:border-white/10 p-3 space-y-2">
            <p className="text-xs text-navy/50 dark:text-white/40">
              Account Managers
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {amTabs.map((amName) => (
                <button
                  key={amName}
                  onClick={() => setSelectedAM(amName)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selectedAM === amName
                      ? 'bg-electric text-white border-electric'
                      : 'bg-white dark:bg-white/5 border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/10'
                  }`}
                >
                  {amName}
                </button>
              ))}
              {isFathomTracker && (
                <button
                  onClick={openAddAMInput}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-electric/60 text-electric hover:bg-electric/5 transition-colors"
                  aria-label="Add Account Manager tab"
                >
                  +
                </button>
              )}
              {isFathomTracker && showAddAMInput && (
                <div className="flex items-center gap-2 p-2 rounded-lg border border-cream-dark/70 dark:border-white/20 bg-white dark:bg-white/5">
                  <input
                    value={newAMName}
                    onChange={(event) => {
                      setNewAMName(event.target.value);
                      if (amInputError) setAMInputError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') addAMTab();
                      if (event.key === 'Escape') closeAddAMInput();
                    }}
                    placeholder="New AM name"
                    className="px-2 py-1 rounded border border-cream-dark dark:border-white/10 bg-white dark:bg-white/5 text-xs text-navy dark:text-white"
                  />
                  <button
                    onClick={addAMTab}
                    className="px-2 py-1 rounded text-[11px] bg-electric text-white hover:bg-electric/90"
                  >
                    Add
                  </button>
                  <button
                    onClick={closeAddAMInput}
                    className="px-2 py-1 rounded text-[11px] border border-cream-dark dark:border-white/10 text-navy/70 dark:text-white/70 hover:bg-cream-dark/20 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {amTabs.length === 0 && !(isFathomTracker && showAddAMInput) && (
                <span className="text-xs text-navy/40 dark:text-white/30">
                  No AM names found yet.
                </span>
              )}
            </div>
            {isFathomTracker && amInputError && (
              <p className="text-xs text-red-600 dark:text-red-400">{amInputError}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-white/5 rounded-xl border border-cream-dark/60 dark:border-white/10 p-3">
          <button
            onClick={addRow}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-electric text-white hover:bg-electric/90 transition-colors"
          >
            Add Row
          </button>
          <button
            onClick={handleSaveNow}
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
            <>
              <div
                ref={headerScrollerRef}
                className="overflow-x-auto overflow-y-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <table className="w-max min-w-full text-sm table-fixed">
                  <colgroup>
                    {columns.map((column) => (
                      <col key={`header-col-${column.key}`} style={{ width: DATA_COLUMN_WIDTH }} />
                    ))}
                    <col style={{ width: ACTION_COLUMN_WIDTH }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-cream-dark/60 dark:border-white/10 bg-cream-dark/20 dark:bg-white/5">
                      {columns.map((column) => (
                        <th key={column.key} className="text-left py-2 px-3">
                          <input
                            value={column.label}
                            onChange={(event) => renameColumn(column.key, event.target.value)}
                            className="w-full px-2 py-1 rounded border border-cream-dark dark:border-white/10 bg-white dark:bg-white/5 text-xs text-navy dark:text-white"
                          />
                        </th>
                      ))}
                      <th className="text-right py-2 px-3">
                        <div className="relative inline-flex">
                          <button
                            onClick={() => {
                              setOpenRowActionsRowId(null);
                              setShowColumnActionsMenu((current) => {
                                const next = !current;
                                if (!next) setShowRemoveColumnMenu(false);
                                return next;
                              });
                            }}
                            className="px-2 py-1 rounded text-[11px] border border-cream-dark dark:border-white/10 text-navy/70 dark:text-white/70 hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors"
                            aria-label="Open column actions"
                          >
                            ...
                          </button>
                          {showColumnActionsMenu && (
                            <div className="absolute right-0 top-full mt-1 min-w-[170px] rounded-lg border border-cream-dark/70 dark:border-white/20 bg-white dark:bg-navy-light shadow-lg z-20 p-1">
                              {!showRemoveColumnMenu ? (
                                <>
                                  <button
                                    onClick={() => {
                                      addColumn();
                                      setShowColumnActionsMenu(false);
                                    }}
                                    className="w-full text-left px-3 py-1.5 rounded text-xs text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/10"
                                  >
                                    Add Column
                                  </button>
                                  <button
                                    onClick={() => setShowRemoveColumnMenu(true)}
                                    className="w-full text-left px-3 py-1.5 rounded text-xs text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/10"
                                  >
                                    Remove Column
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setShowRemoveColumnMenu(false)}
                                    className="w-full text-left px-3 py-1.5 rounded text-xs text-navy/60 dark:text-white/60 hover:bg-cream-dark/20 dark:hover:bg-white/10"
                                  >
                                    Back
                                  </button>
                                  {columns.map((column) => (
                                    <button
                                      key={`remove-${column.key}`}
                                      onClick={() => removeColumn(column.key)}
                                      className="w-full text-left px-3 py-1.5 rounded text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                                    >
                                      {column.label}
                                    </button>
                                  ))}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                </table>
              </div>

              {showMidScrollbar && (
                <div
                  ref={midScrollbarRef}
                  className="overflow-x-auto border-b border-cream-dark/50 dark:border-white/10"
                  aria-label="Horizontal scroll"
                >
                  <div ref={midScrollbarSpacerRef} className="h-4 min-w-full" />
                </div>
              )}

              <div
                ref={bodyScrollerRef}
                className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <table className="w-max min-w-full text-sm table-fixed">
                  <colgroup>
                    {columns.map((column) => (
                      <col key={`body-col-${column.key}`} style={{ width: DATA_COLUMN_WIDTH }} />
                    ))}
                    <col style={{ width: ACTION_COLUMN_WIDTH }} />
                  </colgroup>
                  <tbody>
                    {visibleRows.map((row) => (
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
                        <td className="py-2 px-3 text-right">
                          <div className="relative inline-flex">
                            <button
                              onClick={() => {
                                setShowColumnActionsMenu(false);
                                setShowRemoveColumnMenu(false);
                                setOpenRowActionsRowId((current) =>
                                  current === row.id ? null : row.id
                                );
                              }}
                              className="px-2 py-1 rounded text-[11px] border border-cream-dark dark:border-white/10 text-navy/70 dark:text-white/70 hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors"
                              aria-label={`Open row actions for ${row.id}`}
                            >
                              ...
                            </button>
                            {openRowActionsRowId === row.id && (
                              <div className="absolute right-0 top-full mt-1 min-w-[120px] rounded-lg border border-cream-dark/70 dark:border-white/20 bg-white dark:bg-navy-light shadow-lg z-20 p-1">
                                <button
                                  onClick={() => removeRow(row.id)}
                                  className="w-full text-left px-3 py-1.5 rounded text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                                >
                                  Delete Row
                                </button>
                                <button
                                  onClick={() => undoRowChanges(row.id)}
                                  className="w-full text-left px-3 py-1.5 rounded text-xs text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/10"
                                >
                                  Undo
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={columns.length + 1}
                          className="py-8 px-3 text-center text-sm text-navy/50 dark:text-white/40"
                        >
                          {isAMTabbedTracker && selectedAM
                            ? `No rows for ${selectedAM}.`
                            : 'No rows yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              </>
            )}
        </div>

        {showSavedToast && (
          <div className="fixed bottom-6 right-6 z-50 px-3 py-2 rounded-lg border border-green-200 dark:border-green-500/25 bg-green-50 dark:bg-green-500/15 text-xs font-medium text-green-700 dark:text-green-300 shadow-lg">
            Saved!
          </div>
        )}
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
