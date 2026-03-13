'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PK_TRACKER_FREQUENCIES, PKTrackerType } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

interface TrackerDetailContentProps {
  trackerType: PKTrackerType;
  label: string;
  canManageRows: boolean;
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

type SyncSource = 'api' | 'realtime' | 'mutation' | 'empty';

const TRACKER_TABLES: Partial<Record<PKTrackerType, string>> = {
  fathom_videos: 'pk_fathom_videos',
  client_updates: 'pk_client_updates',
  ticket_updates: 'pk_ticket_updates',
  daily_goals: 'pk_daily_goals',
  sanity_checks: 'pk_sanity_checks',
  sanity_tests: 'pk_sanity_tests',
  pics_monitoring: 'pk_pics_monitoring',
  flagged_tickets: 'pk_flagged_tickets',
  weekly_tickets: 'pk_weekly_tickets',
  pingdom_tests: 'pk_pingdom_tests',
  google_ads_reports: 'pk_google_ads_reports',
  monthly_summaries: 'pk_monthly_summaries',
  update_schedule: 'pk_update_schedule',
  holiday_tracking: 'pk_holiday_tracking',
  website_status: 'pk_website_status',
  google_analytics_status: 'pk_google_analytics_status',
  other_activities: 'pk_other_activities',
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
    { key: 'website_link', label: 'Website Link', type: 'link' },
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
const AM_TABBED_TRACKERS = new Set<PKTrackerType>([
  'fathom_videos',
  'client_updates',
  'sanity_checks',
]);
const DATE_SORT_TRACKERS: Partial<Record<PKTrackerType, string>> = {
  fathom_videos: 'meeting_date',
  client_updates: 'meeting_date',
  sanity_checks: 'check_date',
};
const FATHOM_AM_KEY = 'account_manager_name';
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
const SANITY_CHECKS_REQUIRED_COLUMNS: EditableColumn[] = [
  { key: 'account_manager_name', label: 'AM', type: 'text' },
  { key: 'check_date', label: 'Date', type: 'date' },
  { key: 'client_name', label: 'Client', type: 'text' },
  { key: 'website_link', label: 'Website Link', type: 'link' },
  { key: 'sanity_check_done', label: 'Done', type: 'boolean' },
  { key: 'notes', label: 'Notes', type: 'text' },
];
const SANITY_CHECKS_LEGACY_COLUMNS = new Set(['business_name']);

function toDateTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) return null;
  return timestamp;
}

function getRowSortDateValue(row: EditableRow, trackerType: PKTrackerType): string {
  const primaryKey = DATE_SORT_TRACKERS[trackerType];
  if (!primaryKey) return '';

  if (trackerType === 'client_updates') {
    // Keep sort anchored on Meeting Date while handling legacy rows with date_sent only.
    return String(
      row.values.meeting_date ||
      row.values.date_sent ||
      ''
    );
  }

  return String(row.values[primaryKey] || '');
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

  if (trackerType === 'sanity_checks') {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const normalized = SANITY_CHECKS_REQUIRED_COLUMNS.map((requiredColumn) => {
      const existing = byKey.get(requiredColumn.key);
      return {
        key: requiredColumn.key,
        label: requiredColumn.label,
        type: existing?.type || requiredColumn.type,
      };
    });
    const extraColumns = columns.filter(
      (column) =>
        !SANITY_CHECKS_REQUIRED_COLUMNS.some((required) => required.key === column.key) &&
        !SANITY_CHECKS_LEGACY_COLUMNS.has(column.key)
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

function toTrackerTypeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toApiCellValue(type: ColumnType, value: string): string | boolean | null {
  if (type === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }
  if (type === 'date') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return value === '' ? null : value;
}

function mergeColumnsWithApiRows(
  trackerType: PKTrackerType,
  currentColumns: EditableColumn[],
  apiRows: Record<string, unknown>[]
): EditableColumn[] {
  let nextColumns = currentColumns;
  if (nextColumns.length === 0) {
    nextColumns = TRACKER_COLUMNS[trackerType]
      ? toEditableColumns(TRACKER_COLUMNS[trackerType])
      : [];
  }

  if (nextColumns.length === 0 && apiRows.length > 0) {
    const keys = Object.keys(apiRows[0]).filter((key) => !NON_DISPLAY_KEYS.has(key));
    nextColumns = keys.map((key) => ({
      key,
      label: toDisplayLabel(key),
      type: 'text',
    }));
  }

  if (nextColumns.length === 0) {
    nextColumns = [{ key: 'notes', label: 'Notes', type: 'text' }];
  }

  const knownKeys = new Set(nextColumns.map((column) => column.key));
  const discoveredColumns: EditableColumn[] = [];

  for (const row of apiRows) {
    for (const key of Object.keys(row)) {
      if (NON_DISPLAY_KEYS.has(key) || knownKeys.has(key)) continue;
      discoveredColumns.push({
        key,
        label: toDisplayLabel(key),
        type: 'text',
      });
      knownKeys.add(key);
    }
  }

  return normalizeColumnsForTracker(trackerType, [...nextColumns, ...discoveredColumns]);
}

function mapApiRowsToEditableRows(
  trackerType: PKTrackerType,
  columns: EditableColumn[],
  apiRows: Record<string, unknown>[]
): EditableRow[] {
  return apiRows.map((apiRow, idx) => {
    const values: Record<string, string> = {};

    for (const column of columns) {
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

      values[column.key] = value === null || value === undefined ? '' : String(value);
    }

    return {
      id: String(apiRow.id || `${trackerType}_row_${idx + 1}`),
      values,
    };
  });
}

export default function TrackerDetailContent({
  trackerType,
  label,
  canManageRows,
}: TrackerDetailContentProps) {
  const frequency = PK_TRACKER_FREQUENCIES[trackerType] || '';
  const trackerTable = TRACKER_TABLES[trackerType];
  const supabase = useMemo(() => createClient(), []);

  const [columns, setColumns] = useState<EditableColumn[]>([]);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [columnCounter, setColumnCounter] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string>('');
  const [lastSavedAt, setLastSavedAt] = useState<string>('');
  const [syncSource, setSyncSource] = useState<SyncSource>('empty');
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
  const [newlyAddedRowId, setNewlyAddedRowId] = useState<string | null>(null);
  const [isTrackerVisible, setIsTrackerVisible] = useState(true);
  const headerScrollerRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollerRef = useRef<HTMLDivElement | null>(null);
  const midScrollbarRef = useRef<HTMLDivElement | null>(null);
  const midScrollbarSpacerRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<EditableRow[]>([]);
  const columnsRef = useRef<EditableColumn[]>([]);
  const pendingRowPatchesRef = useRef<Record<string, Record<string, string>>>({});
  const pendingRowPatchTimersRef = useRef<Record<string, number>>({});
  const realtimeRefreshTimerRef = useRef<number | null>(null);

  const isAMTabbedTracker = AM_TABBED_TRACKERS.has(trackerType);

  const amTabs = useMemo(() => {
    if (!isAMTabbedTracker) return [] as string[];
    const namesFromRows = rows
      .map((row) => String(row.values[FATHOM_AM_KEY] || '').trim())
      .filter(Boolean);
    const manualNames = manualAMTabs;
    return Array.from(new Set([...manualNames, ...namesFromRows]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [isAMTabbedTracker, manualAMTabs, rows]);

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

    const sortDateKey = DATE_SORT_TRACKERS[trackerType];
    const preparedRows = sortDateKey
      ? [...filteredRows].sort((a, b) => {
          const aDate = toDateTimestamp(getRowSortDateValue(a, trackerType));
          const bDate = toDateTimestamp(getRowSortDateValue(b, trackerType));
          if (aDate === null && bDate === null) return 0;
          if (aDate === null) return 1;
          if (bDate === null) return -1;
          return bDate - aDate;
        })
      : [...filteredRows];

    if (!newlyAddedRowId) return preparedRows;

    const addedRowIndex = preparedRows.findIndex((row) => row.id === newlyAddedRowId);
    if (addedRowIndex <= 0) return preparedRows;

    const [addedRow] = preparedRows.splice(addedRowIndex, 1);
    preparedRows.unshift(addedRow);
    return preparedRows;
  }, [isAMTabbedTracker, rows, selectedAM, trackerType, newlyAddedRowId]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

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

  const clearPendingRowPatch = useCallback((rowId: string) => {
    const timer = pendingRowPatchTimersRef.current[rowId];
    if (timer) {
      window.clearTimeout(timer);
      delete pendingRowPatchTimersRef.current[rowId];
    }
    delete pendingRowPatchesRef.current[rowId];
  }, []);

  const flushRowPatch = useCallback(
    async (rowId: string) => {
      const pendingPatch = pendingRowPatchesRef.current[rowId];
      if (!pendingPatch || Object.keys(pendingPatch).length === 0) return;

      clearPendingRowPatch(rowId);

      const patch: Record<string, unknown> = {};
      for (const key of Object.keys(pendingPatch)) {
        const columnType =
          columnsRef.current.find((column) => column.key === key)?.type || 'text';
        patch[key] = toApiCellValue(columnType, pendingPatch[key] || '');
      }

      if (Object.keys(patch).length === 0) return;

      try {
        const res = await fetch('/api/performance/tracker', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: trackerType,
            id: rowId,
            patch,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || 'Failed to save row');
        }
        setLastSavedAt(new Date().toISOString());
        setSyncSource('mutation');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save row';
        setErrorText(msg);
      }
    },
    [clearPendingRowPatch, trackerType]
  );

  const queueRowPatch = useCallback(
    (rowId: string, values: Record<string, string>) => {
      pendingRowPatchesRef.current[rowId] = {
        ...(pendingRowPatchesRef.current[rowId] || {}),
        ...values,
      };

      const existingTimer = pendingRowPatchTimersRef.current[rowId];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      pendingRowPatchTimersRef.current[rowId] = window.setTimeout(() => {
        void flushRowPatch(rowId);
      }, 350);
    },
    [flushRowPatch]
  );

  const flushAllPendingRowPatches = useCallback(async () => {
    const rowIds = Object.keys(pendingRowPatchesRef.current);
    if (rowIds.length === 0) return;
    await Promise.all(rowIds.map((rowId) => flushRowPatch(rowId)));
  }, [flushRowPatch]);

  const loadRowsFromDatabase = useCallback(
    async ({
      showLoading = false,
      source = 'api' as SyncSource,
    }: { showLoading?: boolean; source?: SyncSource } = {}) => {
      if (showLoading) setLoading(true);

      try {
        setErrorText(null);
        const params = new URLSearchParams({
          type: trackerType,
          limit: '2000',
          offset: '0',
        });
        const res = await fetch(`/api/performance/tracker?${params.toString()}`, {
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || 'Failed to load tracker rows');
        }

        const payload = json.data || json;
        const apiRows: Record<string, unknown>[] = Array.isArray(payload?.rows)
          ? payload.rows
          : [];

        const nextColumns = mergeColumnsWithApiRows(
          trackerType,
          columnsRef.current,
          apiRows
        );
        const nextRows = mapApiRowsToEditableRows(trackerType, nextColumns, apiRows);

        setColumns(nextColumns);
        setRows(nextRows);
        setRowUndoValues({});
        setOpenRowActionsRowId(null);
        setColumnCounter((current) =>
          Math.max(
            current,
            nextColumns.filter((column) => column.key.startsWith('column_')).length + 1
          )
        );

        const now = new Date().toISOString();
        setLastLoadedAt(now);
        setSyncSource(apiRows.length > 0 ? source : 'empty');
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load tracker rows.';
        setErrorText(message);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [trackerType]
  );

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current) {
      window.clearTimeout(realtimeRefreshTimerRef.current);
    }
    realtimeRefreshTimerRef.current = window.setTimeout(() => {
      void loadRowsFromDatabase({ source: 'realtime' });
      realtimeRefreshTimerRef.current = null;
    }, 150);
  }, [loadRowsFromDatabase]);

  const loadTrackerVisibility = useCallback(async () => {
    if (!canManageRows) {
      setIsTrackerVisible(true);
      return;
    }

    try {
      const params = new URLSearchParams({ type: trackerType });
      const res = await fetch(
        `/api/performance/tracker-visibility?${params.toString()}`,
        { cache: 'no-store' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsTrackerVisible(true);
        return;
      }

      const hiddenFromFlag = json?.data?.hidden;
      if (typeof hiddenFromFlag === 'boolean') {
        setIsTrackerVisible(!hiddenFromFlag);
        return;
      }

      const hiddenTrackerTypes = toTrackerTypeList(
        json?.data?.hidden_tracker_types
      );
      setIsTrackerVisible(!hiddenTrackerTypes.includes(trackerType));
    } catch {
      setIsTrackerVisible(true);
    }
  }, [canManageRows, trackerType]);

  useEffect(() => {
    void loadTrackerVisibility();
  }, [loadTrackerVisibility]);

  const toggleTrackerVisibility = useCallback(async () => {
    if (!canManageRows) return;

    setErrorText(null);
    const nextHiddenState = isTrackerVisible;
    try {
      const res = await fetch('/api/performance/tracker-visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: trackerType,
          hidden: nextHiddenState,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorText(json?.error || 'Failed to update tracker visibility.');
        return;
      }

      const hiddenFromResponse = json?.data?.hidden;
      if (typeof hiddenFromResponse === 'boolean') {
        setIsTrackerVisible(!hiddenFromResponse);
      } else {
        setIsTrackerVisible(!nextHiddenState);
      }
      setShowSavedToast(true);
      setSavedToastTick((current) => current + 1);
    } catch {
      setErrorText('Failed to update tracker visibility.');
    }
  }, [canManageRows, isTrackerVisible, trackerType]);

  useEffect(() => {
    Object.values(pendingRowPatchTimersRef.current).forEach((timer) => {
      window.clearTimeout(timer);
    });
    pendingRowPatchTimersRef.current = {};
    pendingRowPatchesRef.current = {};
    if (realtimeRefreshTimerRef.current) {
      window.clearTimeout(realtimeRefreshTimerRef.current);
      realtimeRefreshTimerRef.current = null;
    }
    rowsRef.current = [];
    columnsRef.current = [];

    setColumns([]);
    setRows([]);
    setColumnCounter(1);
    setManualAMTabs([]);
    setSelectedAM('');
    setRowUndoValues({});
    setOpenRowActionsRowId(null);
    setNewlyAddedRowId(null);
    setLastSavedAt('');
    setLastLoadedAt('');
    setSyncSource('empty');
    setLoading(true);
  }, [trackerType]);

  useEffect(() => {
    void loadRowsFromDatabase({ showLoading: true, source: 'api' });
  }, [loadRowsFromDatabase]);

  useEffect(() => {
    if (!trackerTable) return;

    const channel = supabase
      .channel(`tracker-${trackerType}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: trackerTable },
        () => {
          scheduleRealtimeRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scheduleRealtimeRefresh, supabase, trackerTable, trackerType]);

  useEffect(() => {
    return () => {
      Object.values(pendingRowPatchTimersRef.current).forEach((timer) => {
        window.clearTimeout(timer);
      });
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
    };
  }, []);

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
    if (!canManageRows) return;
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
  }, [canManageRows, columnCounter, columns, rows]);

  const removeColumn = useCallback(
    (columnKey: string) => {
      if (!canManageRows) return;
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
    [canManageRows, columns, rows]
  );

  const renameColumn = useCallback((columnKey: string, nextLabel: string) => {
    if (!canManageRows) return;
    setColumns((current) =>
      current.map((column) =>
        column.key === columnKey ? { ...column, label: nextLabel } : column
      )
    );
  }, [canManageRows]);

  const addRow = useCallback(async () => {
    if (!canManageRows) return;
    const newRow = buildEmptyRow(columns, `new_${Date.now()}`);
    if (isAMTabbedTracker && selectedAM) {
      newRow.values[FATHOM_AM_KEY] = selectedAM;
    }
    if (isAMTabbedTracker && !String(newRow.values[FATHOM_AM_KEY] || '').trim()) {
      setErrorText('Select or add an AM before adding a row.');
      return;
    }

    const rowPayload: Record<string, unknown> = {};
    for (const column of columns) {
      rowPayload[column.key] = toApiCellValue(
        column.type,
        newRow.values[column.key] || ''
      );
    }

    try {
      setErrorText(null);
      const res = await fetch('/api/performance/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: trackerType,
          row: rowPayload,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to add row');
      }

      const payload = json.data || json;
      const createdRow =
        payload?.row && typeof payload.row === 'object'
          ? (payload.row as Record<string, unknown>)
          : null;

      if (createdRow) {
        const [mappedRow] = mapApiRowsToEditableRows(
          trackerType,
          columnsRef.current,
          [createdRow]
        );
        if (mappedRow) {
          setRows((current) => [mappedRow, ...current]);
          setNewlyAddedRowId(mappedRow.id);
        }
      } else {
        await loadRowsFromDatabase({ source: 'mutation' });
      }

      setLastSavedAt(new Date().toISOString());
      setSyncSource('mutation');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add row';
      setErrorText(message);
    }
  }, [canManageRows, columns, isAMTabbedTracker, loadRowsFromDatabase, selectedAM, trackerType]);

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
    if (!canManageRows) return;
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
  }, [amTabs, canManageRows, newAMName]);

  const removeRow = useCallback(
    async (rowId: string) => {
      if (!canManageRows) return;
      try {
        setErrorText(null);
        clearPendingRowPatch(rowId);
        const res = await fetch('/api/performance/tracker', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: trackerType,
            id: rowId,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || 'Failed to delete row');
        }

        setRows((current) => current.filter((row) => row.id !== rowId));
        setRowUndoValues((current) => {
          if (!Object.prototype.hasOwnProperty.call(current, rowId)) return current;
          const next = { ...current };
          delete next[rowId];
          return next;
        });
        setNewlyAddedRowId((current) => (current === rowId ? null : current));
        setOpenRowActionsRowId((current) => (current === rowId ? null : current));
        setLastSavedAt(new Date().toISOString());
        setSyncSource('mutation');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete row';
        setErrorText(message);
      }
    },
    [canManageRows, clearPendingRowPatch, trackerType]
  );

  const updateCell = useCallback(
    (rowId: string, columnKey: string, value: string) => {
      if (!canManageRows) return;
      const targetRow = rowsRef.current.find((row) => row.id === rowId);
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
      queueRowPatch(rowId, { [columnKey]: value });
    },
    [canManageRows, queueRowPatch]
  );

  const undoRowChanges = useCallback(
    (rowId: string) => {
      if (!canManageRows) return;
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
      queueRowPatch(rowId, snapshot);
      setOpenRowActionsRowId(null);
    },
    [canManageRows, queueRowPatch, rowUndoValues]
  );

  const syncText = useMemo(() => {
    if (!lastSavedAt) return 'Live sync active';
    return `Last synced ${new Date(lastSavedAt).toLocaleString()}`;
  }, [lastSavedAt]);

  const handleSaveNow = useCallback(async () => {
    if (!canManageRows) return;
    await flushAllPendingRowPatches();
    await loadRowsFromDatabase({ source: 'mutation' });
    setShowSavedToast(true);
    setSavedToastTick((current) => current + 1);
  }, [canManageRows, flushAllPendingRowPatches, loadRowsFromDatabase]);

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
              {isAMTabbedTracker && canManageRows && (
                <button
                  onClick={openAddAMInput}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-electric/60 text-electric hover:bg-electric/5 transition-colors"
                  aria-label="Add Account Manager tab"
                >
                  +
                </button>
              )}
              {isAMTabbedTracker && canManageRows && showAddAMInput && (
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
              {amTabs.length === 0 && !(isAMTabbedTracker && canManageRows && showAddAMInput) && (
                <span className="text-xs text-navy/40 dark:text-white/30">
                  No AM names found yet.
                </span>
              )}
            </div>
            {isAMTabbedTracker && canManageRows && amInputError && (
              <p className="text-xs text-red-600 dark:text-red-400">{amInputError}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-white/5 rounded-xl border border-cream-dark/60 dark:border-white/10 p-3">
          {canManageRows && (
            <button
              onClick={addRow}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-electric text-white hover:bg-electric/90 transition-colors"
            >
              Add Row
            </button>
          )}
          {canManageRows && (
            <button
              onClick={handleSaveNow}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors"
            >
              Save Now
            </button>
          )}
          {canManageRows && (
            <button
              onClick={toggleTrackerVisibility}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isTrackerVisible
                  ? 'border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/5'
                  : 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/30 dark:text-amber-300 dark:bg-amber-500/10 dark:hover:bg-amber-500/20'
              }`}
            >
              {isTrackerVisible ? 'Hide In All Trackers' : 'Show In All Trackers'}
            </button>
          )}
          <span className="text-xs text-navy/50 dark:text-white/40">
            Tracker: <code>{trackerType}</code>
          </span>
          <span className="text-xs text-navy/40 dark:text-white/30">{syncText}</span>
          {!canManageRows && (
            <span className="text-xs text-navy/40 dark:text-white/30">
              Read-only view
            </span>
          )}
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
                          {canManageRows ? (
                            <input
                              value={column.label}
                              onChange={(event) => renameColumn(column.key, event.target.value)}
                              className="w-full px-2 py-1 rounded border border-cream-dark dark:border-white/10 bg-white dark:bg-white/5 text-xs text-navy dark:text-white"
                            />
                          ) : (
                            <span className="text-xs font-medium text-navy/70 dark:text-white/70">
                              {column.label}
                            </span>
                          )}
                        </th>
                      ))}
                      <th className="text-right py-2 px-3">
                        {canManageRows ? (
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
                        ) : (
                          <span className="text-xs text-navy/50 dark:text-white/40">Rows</span>
                        )}
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
                              readOnly={!canManageRows}
                              onChange={(nextValue) =>
                                updateCell(row.id, column.key, nextValue)
                              }
                            />
                          </td>
                        ))}
                        <td className="py-2 px-3 text-right">
                          {canManageRows && (
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
                          )}
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
  readOnly,
  onChange,
}: {
  type: ColumnType;
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  if (readOnly) {
    if (type === 'boolean') {
      return (
        <span className="text-xs text-navy dark:text-white/80">
          {value === 'true' ? 'Yes' : value === 'false' ? 'No' : '-'}
        </span>
      );
    }
    return (
      <span className="text-xs text-navy dark:text-white/80">
        {value || '-'}
      </span>
    );
  }

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
