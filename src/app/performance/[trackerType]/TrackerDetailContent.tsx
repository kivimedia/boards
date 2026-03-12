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

interface AMTabMeta {
  id: string;
  name: string;
  storageSlug: string;
}

interface TrackerTabsMetaPayload {
  version: 1;
  tabs: AMTabMeta[];
  activeTabId: string;
  lastUpdatedAt: string;
}

const TRACKER_STORAGE_NAMESPACES: Partial<Record<PKTrackerType, string>> = {
  client_updates: 'tracker:client_updates',
  fathom_videos: 'tracker:fathom_videos',
  sanity_checks: 'tracker:sanity_checks',
  pics_monitoring: 'tracker:pics_monitoring',
  ticket_updates: 'tracker:ticket_updates',
  flagged_tickets: 'tracker:flagged_tickets',
  google_ads_reports: 'tracker:google_ads_reports',
  pingdom_tests: 'tracker:pingdom_tests',
  holiday_tracking: 'tracker:holiday_tracking',
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
const DEFAULT_AM_TAB_NAME = 'General';

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

function buildSeedRowsForTab(
  columns: EditableColumn[],
  rowId: string,
  tabName: string
): EditableRow[] {
  const row = buildEmptyRow(columns, rowId);
  const hasAMColumn = columns.some((column) => column.key === 'account_manager_name');
  if (hasAMColumn && tabName !== DEFAULT_AM_TAB_NAME) {
    row.values.account_manager_name = tabName;
  }
  return [row];
}

function normalizeRowsForColumns(rows: EditableRow[], columns: EditableColumn[]): EditableRow[] {
  return rows.map((row, index) => {
    const values: Record<string, string> = {};
    const rowValues =
      row && typeof row.values === 'object' && row.values
        ? (row.values as Record<string, unknown>)
        : {};

    for (const column of columns) {
      const value = rowValues[column.key];
      values[column.key] = value === null || value === undefined ? '' : String(value);
    }

    return {
      id: String(row?.id || `row_${index + 1}`),
      values,
    };
  });
}

function normalizeAmSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function makeUniqueSlug(baseName: string, usedSlugs: Set<string>): string {
  const base = normalizeAmSlug(baseName) || 'am_tab';
  if (!usedSlugs.has(base)) {
    usedSlugs.add(base);
    return base;
  }

  let suffix = 2;
  let candidate = `${base}_${suffix}`;
  while (usedSlugs.has(candidate)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
  usedSlugs.add(candidate);
  return candidate;
}

function getAmTabsMetaKey(namespace: string): string {
  return `${namespace}:am_tabs`;
}

function getAmStorageKey(namespace: string, amSlug: string): string {
  return `${namespace}:am:${amSlug}`;
}

function splitRowsByAccountManager(rows: EditableRow[]): Map<string, EditableRow[]> {
  const grouped = new Map<string, EditableRow[]>();
  let hasAnyAmName = false;

  for (const row of rows) {
    const amName = (row.values.account_manager_name || '').trim();
    if (amName) hasAnyAmName = true;
    const groupName = amName || DEFAULT_AM_TAB_NAME;
    const current = grouped.get(groupName) || [];
    current.push(row);
    grouped.set(groupName, current);
  }

  if (!hasAnyAmName) {
    return new Map([[DEFAULT_AM_TAB_NAME, rows]]);
  }

  return grouped;
}

function parseTrackerPayload(raw: string | null): TrackerStoragePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TrackerStoragePayload>;
    const source = parsed.sync?.source;
    const safeSource: 'local' | 'api_seed' | 'empty_seed' =
      source === 'local' || source === 'api_seed' || source === 'empty_seed'
        ? source
        : 'local';

    if (
      parsed &&
      Array.isArray(parsed.columns) &&
      Array.isArray(parsed.rows) &&
      parsed.settings &&
      typeof parsed.settings.columnCounter === 'number' &&
      typeof parsed.settings.rowCounter === 'number'
    ) {
      return {
        version: 1,
        trackerType: String(parsed.trackerType || ''),
        columns: parsed.columns as EditableColumn[],
        rows: parsed.rows as EditableRow[],
        settings: {
          columnCounter: parsed.settings.columnCounter,
          rowCounter: parsed.settings.rowCounter,
        },
        sync: {
          lastLoadedAt: String(parsed.sync?.lastLoadedAt || ''),
          lastSavedAt: String(parsed.sync?.lastSavedAt || ''),
          source: safeSource,
        },
      };
    }
  } catch {
    return null;
  }
  return null;
}

function parseTabsMetaPayload(raw: string | null): TrackerTabsMetaPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TrackerTabsMetaPayload>;
    if (parsed && Array.isArray(parsed.tabs)) {
      return {
        version: 1,
        tabs: parsed.tabs as AMTabMeta[],
        activeTabId: String(parsed.activeTabId || ''),
        lastUpdatedAt: String(parsed.lastUpdatedAt || ''),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeTabs(tabs: AMTabMeta[]): AMTabMeta[] {
  const usedIds = new Set<string>();
  const usedSlugs = new Set<string>();
  const now = Date.now();
  const normalized: AMTabMeta[] = [];

  tabs.forEach((tab, index) => {
    const name =
      typeof tab?.name === 'string' && tab.name.trim()
        ? tab.name.trim()
        : `AM ${index + 1}`;
    let id =
      typeof tab?.id === 'string' && tab.id.trim()
        ? tab.id.trim()
        : `am_tab_${now}_${index}`;
    while (usedIds.has(id)) {
      id = `${id}_${index + 1}`;
    }
    usedIds.add(id);

    const slugInput =
      typeof tab?.storageSlug === 'string' && tab.storageSlug.trim()
        ? tab.storageSlug
        : name;
    const storageSlug = makeUniqueSlug(slugInput, usedSlugs);

    normalized.push({ id, name, storageSlug });
  });

  if (normalized.length === 0) {
    const storageSlug = makeUniqueSlug(DEFAULT_AM_TAB_NAME, usedSlugs);
    normalized.push({
      id: `am_tab_${now}_default`,
      name: DEFAULT_AM_TAB_NAME,
      storageSlug,
    });
  }

  return normalized;
}

export default function TrackerDetailContent({
  trackerType,
  label,
}: TrackerDetailContentProps) {
  const trackerNamespace =
    TRACKER_STORAGE_NAMESPACES[trackerType] || `tracker:${trackerType}`;
  const tabsMetaKey = getAmTabsMetaKey(trackerNamespace);
  const legacySingleStorageKey = trackerNamespace;
  const frequency = PK_TRACKER_FREQUENCIES[trackerType] || '';

  const [tabs, setTabs] = useState<AMTabMeta[]>([]);
  const [activeTabId, setActiveTabId] = useState('');
  const [loadedTabId, setLoadedTabId] = useState('');
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

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || null,
    [tabs, activeTabId]
  );
  const activeStorageKey = activeTab
    ? getAmStorageKey(trackerNamespace, activeTab.storageSlug)
    : '';

  const getDefaultColumns = useCallback((): EditableColumn[] => {
    if (TRACKER_COLUMNS[trackerType]) {
      return normalizeColumnsForTracker(
        trackerType,
        toEditableColumns(TRACKER_COLUMNS[trackerType])
      );
    }
    return [{ key: 'notes', label: 'Notes', type: 'text' }];
  }, [trackerType]);

  const persistTabsMeta = useCallback(
    (nextTabs: AMTabMeta[], nextActiveTabId: string) => {
      const payload: TrackerTabsMetaPayload = {
        version: 1,
        tabs: nextTabs,
        activeTabId: nextActiveTabId,
        lastUpdatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(tabsMetaKey, JSON.stringify(payload));
    },
    [tabsMetaKey]
  );

  const persistTabState = useCallback(
    (
      storageKey: string,
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
    [trackerType]
  );

  const loadTabFromStorage = useCallback(
    (tab: AMTabMeta) => {
      setLoading(true);
      setHydrated(false);
      setLoadedTabId('');
      setErrorText(null);

      try {
        const storageKey = getAmStorageKey(trackerNamespace, tab.storageSlug);
        const parsed = parseTrackerPayload(window.localStorage.getItem(storageKey));

        if (parsed) {
          const normalizedColumns = normalizeColumnsForTracker(
            trackerType,
            parsed.columns
          );
          const normalizedRows = normalizeRowsForColumns(parsed.rows, normalizedColumns);

          setColumns(normalizedColumns);
          setRows(normalizedRows);
          setColumnCounter(
            Math.max(
              1,
              parsed.settings.columnCounter ||
                normalizedColumns.filter((column) => column.key.startsWith('column_'))
                  .length +
                  1
            )
          );
          setRowCounter(Math.max(1, parsed.settings.rowCounter || normalizedRows.length + 1));
          setLastLoadedAt(parsed.sync.lastLoadedAt || new Date().toISOString());
          setLastSavedAt(parsed.sync.lastSavedAt || '');
          setSyncSource(parsed.sync.source || 'local');
          setHydrated(true);
          setLoadedTabId(tab.id);
          setLoading(false);
          return;
        }

        const seedColumns = getDefaultColumns();
        const seedRows = buildSeedRowsForTab(
          seedColumns,
          `${trackerType}_${tab.storageSlug}_row_1`,
          tab.name
        );
        const seedLoadedAt = new Date().toISOString();
        const nextColumnCounter = Math.max(
          1,
          seedColumns.filter((column) => column.key.startsWith('column_')).length + 1
        );
        const nextRowCounter = 2;

        setColumns(seedColumns);
        setRows(seedRows);
        setColumnCounter(nextColumnCounter);
        setRowCounter(nextRowCounter);
        setLastLoadedAt(seedLoadedAt);
        setLastSavedAt('');
        setSyncSource('empty_seed');
        setHydrated(true);
        setLoadedTabId(tab.id);

        persistTabState(
          storageKey,
          seedColumns,
          seedRows,
          nextColumnCounter,
          nextRowCounter,
          'empty_seed',
          seedLoadedAt
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load Account Manager tab.';
        setErrorText(message);
      } finally {
        setLoading(false);
      }
    },
    [getDefaultColumns, persistTabState, trackerNamespace, trackerType]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHydrated(false);
    setLoadedTabId('');
    setErrorText(null);
    setTabs([]);
    setActiveTabId('');

    const init = async () => {
      try {
        const storedMeta = parseTabsMetaPayload(
          window.localStorage.getItem(tabsMetaKey)
        );

        if (storedMeta && storedMeta.tabs.length > 0) {
          const normalizedTabs = sanitizeTabs(storedMeta.tabs);
          const validActiveId = normalizedTabs.some(
            (tab) => tab.id === storedMeta.activeTabId
          )
            ? storedMeta.activeTabId
            : normalizedTabs[0].id;

          persistTabsMeta(normalizedTabs, validActiveId);

          if (cancelled) return;
          setTabs(normalizedTabs);
          setActiveTabId(validActiveId);
          setLoading(false);
          return;
        }

        const legacyPayload = parseTrackerPayload(
          window.localStorage.getItem(legacySingleStorageKey)
        );

        if (legacyPayload) {
          const normalizedColumns = normalizeColumnsForTracker(
            trackerType,
            legacyPayload.columns
          );
          const normalizedRows = normalizeRowsForColumns(
            legacyPayload.rows,
            normalizedColumns
          );
          const groupedRows = splitRowsByAccountManager(normalizedRows);
          const usedSlugs = new Set<string>();
          const seededTabs: AMTabMeta[] = [];
          const now = Date.now();
          let index = 0;

          for (const groupName of groupedRows.keys()) {
            const storageSlug = makeUniqueSlug(groupName, usedSlugs);
            seededTabs.push({
              id: `am_tab_${now}_${index}_${storageSlug}`,
              name: groupName,
              storageSlug,
            });
            index += 1;
          }

          for (const tab of seededTabs) {
            const groupRows = groupedRows.get(tab.name) || [];
            const rowsForTab =
              groupRows.length > 0
                ? groupRows
                : buildSeedRowsForTab(
                    normalizedColumns,
                    `${trackerType}_${tab.storageSlug}_row_1`,
                    tab.name
                  );
            const nextColumnCounter = Math.max(
              1,
              legacyPayload.settings.columnCounter ||
                normalizedColumns.filter((column) => column.key.startsWith('column_'))
                  .length +
                  1
            );
            const nextRowCounter = Math.max(
              1,
              legacyPayload.settings.rowCounter || rowsForTab.length + 1
            );

            persistTabState(
              getAmStorageKey(trackerNamespace, tab.storageSlug),
              normalizedColumns,
              rowsForTab,
              nextColumnCounter,
              nextRowCounter,
              'local',
              legacyPayload.sync.lastLoadedAt || new Date().toISOString()
            );
          }

          const firstTabId = seededTabs[0]?.id || '';
          persistTabsMeta(seededTabs, firstTabId);
          window.localStorage.removeItem(legacySingleStorageKey);

          if (cancelled) return;
          setTabs(seededTabs);
          setActiveTabId(firstTabId);
          setLoading(false);
          return;
        }

        const res = await fetch(
          `/api/performance/tracker?type=${trackerType}&limit=500&offset=0`
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;

        const source: 'api_seed' | 'empty_seed' = res.ok ? 'api_seed' : 'empty_seed';
        const payload = json.data || json;
        const apiRows: Record<string, unknown>[] = Array.isArray(payload?.rows)
          ? payload.rows
          : [];

        let initialColumns = getDefaultColumns();
        if (initialColumns.length === 0 && apiRows.length > 0) {
          const keys = Object.keys(apiRows[0]).filter((key) => !NON_DISPLAY_KEYS.has(key));
          initialColumns = keys.map((key) => ({
            key,
            label: toDisplayLabel(key),
            type: 'text',
          }));
        }
        initialColumns = normalizeColumnsForTracker(trackerType, initialColumns);

        const editableRows =
          apiRows.length > 0
            ? apiRows.map((apiRow, index) => {
                const nextValues: Record<string, string> = {};
                for (const column of initialColumns) {
                  const value = apiRow[column.key];
                  nextValues[column.key] =
                    value === null || value === undefined ? '' : String(value);
                }
                return {
                  id: String(apiRow.id || `${trackerType}_row_${index + 1}`),
                  values: nextValues,
                };
              })
            : [];

        const groupedRows = splitRowsByAccountManager(
          editableRows.length > 0
            ? editableRows
            : buildSeedRowsForTab(
                initialColumns,
                `${trackerType}_general_row_1`,
                DEFAULT_AM_TAB_NAME
              )
        );

        const usedSlugs = new Set<string>();
        const seededTabs: AMTabMeta[] = [];
        const now = Date.now();
        let index = 0;
        for (const groupName of groupedRows.keys()) {
          const storageSlug = makeUniqueSlug(groupName, usedSlugs);
          seededTabs.push({
            id: `am_tab_${now}_${index}_${storageSlug}`,
            name: groupName,
            storageSlug,
          });
          index += 1;
        }

        const loadedAt = new Date().toISOString();
        for (const tab of seededTabs) {
          const grouped = groupedRows.get(tab.name) || [];
          const rowsForTab =
            grouped.length > 0
              ? grouped
              : buildSeedRowsForTab(
                  initialColumns,
                  `${trackerType}_${tab.storageSlug}_row_1`,
                  tab.name
                );
          const nextColumnCounter = Math.max(
            1,
            initialColumns.filter((column) => column.key.startsWith('column_')).length + 1
          );
          const nextRowCounter = Math.max(1, rowsForTab.length + 1);

          persistTabState(
            getAmStorageKey(trackerNamespace, tab.storageSlug),
            initialColumns,
            rowsForTab,
            nextColumnCounter,
            nextRowCounter,
            source,
            loadedAt
          );
        }

        const firstTabId = seededTabs[0]?.id || '';
        persistTabsMeta(seededTabs, firstTabId);

        if (cancelled) return;
        setTabs(seededTabs);
        setActiveTabId(firstTabId);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'Failed to initialize tracker storage.';
        setErrorText(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [
    getDefaultColumns,
    legacySingleStorageKey,
    persistTabState,
    persistTabsMeta,
    tabsMetaKey,
    trackerNamespace,
    trackerType,
  ]);

  useEffect(() => {
    if (!activeTab) return;
    loadTabFromStorage(activeTab);
  }, [activeTab, loadTabFromStorage]);

  const persistCurrentTabNow = useCallback(() => {
    if (!activeTab || !hydrated || loadedTabId !== activeTab.id) return;
    persistTabState(
      getAmStorageKey(trackerNamespace, activeTab.storageSlug),
      columns,
      rows,
      columnCounter,
      rowCounter,
      syncSource,
      lastLoadedAt || new Date().toISOString()
    );
  }, [
    activeTab,
    hydrated,
    loadedTabId,
    persistTabState,
    trackerNamespace,
    columns,
    rows,
    columnCounter,
    rowCounter,
    syncSource,
    lastLoadedAt,
  ]);

  useEffect(() => {
    if (!activeTab || !activeStorageKey || !hydrated) return;
    if (loadedTabId !== activeTab.id) return;

    const timeout = window.setTimeout(() => {
      persistTabState(
        activeStorageKey,
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
    activeTab,
    activeStorageKey,
    columns,
    rows,
    columnCounter,
    rowCounter,
    hydrated,
    loadedTabId,
    persistTabState,
    syncSource,
    lastLoadedAt,
  ]);

  const activateTab = useCallback(
    (tabId: string) => {
      if (tabId === activeTabId) return;
      if (!tabs.some((tab) => tab.id === tabId)) return;
      persistCurrentTabNow();
      setActiveTabId(tabId);
      persistTabsMeta(tabs, tabId);
    },
    [activeTabId, persistCurrentTabNow, persistTabsMeta, tabs]
  );

  const addTab = useCallback(() => {
    const input = window.prompt('Account Manager tab name', '');
    if (input === null) return;

    const name = input.trim() || `AM ${tabs.length + 1}`;
    const usedSlugs = new Set(tabs.map((tab) => tab.storageSlug));
    const storageSlug = makeUniqueSlug(name, usedSlugs);
    const tabId = `am_tab_${Date.now()}_${storageSlug}`;
    const nextTab: AMTabMeta = { id: tabId, name, storageSlug };

    persistCurrentTabNow();

    const nextTabs = [...tabs, nextTab];
    const seedColumns = columns.length > 0 ? columns : getDefaultColumns();
    const seedRows = buildSeedRowsForTab(
      seedColumns,
      `${trackerType}_${storageSlug}_row_1`,
      name
    );
    const now = new Date().toISOString();
    const nextColumnCounter = Math.max(
      1,
      seedColumns.filter((column) => column.key.startsWith('column_')).length + 1
    );

    persistTabState(
      getAmStorageKey(trackerNamespace, storageSlug),
      seedColumns,
      seedRows,
      nextColumnCounter,
      2,
      'local',
      now
    );
    persistTabsMeta(nextTabs, tabId);

    setTabs(nextTabs);
    setActiveTabId(tabId);
  }, [
    columns,
    getDefaultColumns,
    persistCurrentTabNow,
    persistTabState,
    persistTabsMeta,
    tabs,
    trackerNamespace,
    trackerType,
  ]);

  const renameActiveTab = useCallback(() => {
    if (!activeTab) return;

    const input = window.prompt('Rename Account Manager tab', activeTab.name);
    if (input === null) return;

    const name = input.trim();
    if (!name) return;

    persistCurrentTabNow();

    const usedSlugs = new Set(
      tabs.filter((tab) => tab.id !== activeTab.id).map((tab) => tab.storageSlug)
    );
    const nextStorageSlug = makeUniqueSlug(name, usedSlugs);
    const currentStorageKey = getAmStorageKey(trackerNamespace, activeTab.storageSlug);
    const nextStorageKey = getAmStorageKey(trackerNamespace, nextStorageSlug);

    if (nextStorageKey !== currentStorageKey) {
      const currentPayload = parseTrackerPayload(
        window.localStorage.getItem(currentStorageKey)
      );
      const now = new Date().toISOString();

      if (currentPayload) {
        const migratedPayload: TrackerStoragePayload = {
          ...currentPayload,
          sync: {
            ...currentPayload.sync,
            lastLoadedAt: currentPayload.sync.lastLoadedAt || lastLoadedAt || now,
            lastSavedAt: now,
            source: currentPayload.sync.source || 'local',
          },
        };
        window.localStorage.setItem(nextStorageKey, JSON.stringify(migratedPayload));
      } else {
        persistTabState(
          nextStorageKey,
          columns,
          rows,
          columnCounter,
          rowCounter,
          syncSource,
          lastLoadedAt || now
        );
      }

      window.localStorage.removeItem(currentStorageKey);
      setLastSavedAt(now);
    }

    const nextTabs = tabs.map((tab) =>
      tab.id === activeTab.id
        ? { ...tab, name, storageSlug: nextStorageSlug }
        : tab
    );

    persistTabsMeta(nextTabs, activeTab.id);
    setTabs(nextTabs);
  }, [
    activeTab,
    columns,
    columnCounter,
    lastLoadedAt,
    persistCurrentTabNow,
    persistTabState,
    persistTabsMeta,
    rowCounter,
    rows,
    syncSource,
    tabs,
    trackerNamespace,
  ]);

  const removeActiveTab = useCallback(() => {
    if (!activeTab) return;

    const shouldRemove = window.confirm(
      `Remove tab "${activeTab.name}" and all of its saved data?`
    );
    if (!shouldRemove) return;

    persistCurrentTabNow();

    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab.id);
    let nextTabs = tabs.filter((tab) => tab.id !== activeTab.id);

    window.localStorage.removeItem(
      getAmStorageKey(trackerNamespace, activeTab.storageSlug)
    );

    if (nextTabs.length === 0) {
      const storageSlug = makeUniqueSlug(DEFAULT_AM_TAB_NAME, new Set());
      const fallbackTab: AMTabMeta = {
        id: `am_tab_${Date.now()}_${storageSlug}`,
        name: DEFAULT_AM_TAB_NAME,
        storageSlug,
      };
      const seedColumns = getDefaultColumns();
      const seedRows = buildSeedRowsForTab(
        seedColumns,
        `${trackerType}_${storageSlug}_row_1`,
        DEFAULT_AM_TAB_NAME
      );
      const now = new Date().toISOString();
      const nextColumnCounter = Math.max(
        1,
        seedColumns.filter((column) => column.key.startsWith('column_')).length + 1
      );

      persistTabState(
        getAmStorageKey(trackerNamespace, storageSlug),
        seedColumns,
        seedRows,
        nextColumnCounter,
        2,
        'empty_seed',
        now
      );

      nextTabs = [fallbackTab];
    }

    const nextActiveTab =
      nextTabs[Math.max(0, currentIndex - 1)] || nextTabs[0] || null;
    const nextActiveTabId = nextActiveTab?.id || '';

    persistTabsMeta(nextTabs, nextActiveTabId);
    setTabs(nextTabs);
    setActiveTabId(nextActiveTabId);
  }, [
    activeTab,
    getDefaultColumns,
    persistCurrentTabNow,
    persistTabState,
    persistTabsMeta,
    tabs,
    trackerNamespace,
    trackerType,
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
    const rowId = `${trackerType}_${activeTab?.storageSlug || 'tab'}_row_${rowCounter}`;
    const nextRow = buildEmptyRow(columns, rowId);
    const hasAMColumn = columns.some((column) => column.key === 'account_manager_name');
    if (hasAMColumn && activeTab && activeTab.name !== DEFAULT_AM_TAB_NAME) {
      nextRow.values.account_manager_name = activeTab.name;
    }

    setRows((current) => [...current, nextRow]);
    setRowCounter((current) => current + 1);
  }, [activeTab, columns, rowCounter, trackerType]);

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

        <div className="bg-white dark:bg-white/5 rounded-xl border border-cream-dark/60 dark:border-white/10 p-3 space-y-3">
          <div
            role="tablist"
            aria-label="Account Manager tabs"
            className="flex flex-wrap items-center gap-2"
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => activateTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-electric text-white'
                      : 'border border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/5'
                  }`}
                >
                  {tab.name}
                </button>
              );
            })}
            {tabs.length === 0 && (
              <span className="text-xs text-navy/50 dark:text-white/40">
                No Account Manager tabs yet.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={addTab}
              aria-label="Add Account Manager tab"
              title="Add Account Manager"
              className="h-8 w-8 rounded-lg text-base font-semibold border border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors"
            >
              +
            </button>
            <button
              onClick={renameActiveTab}
              disabled={!activeTab}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Rename Tab
            </button>
            <button
              onClick={removeActiveTab}
              disabled={!activeTab}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Remove Tab
            </button>
            <span className="text-xs text-navy/50 dark:text-white/40">
              Tab Key: <code>{activeStorageKey || 'No tab selected'}</code>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-white/5 rounded-xl border border-cream-dark/60 dark:border-white/10 p-3">
          <button
            onClick={addRow}
            disabled={!activeTab}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-electric text-white hover:bg-electric/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Row
          </button>
          <button
            onClick={addColumn}
            disabled={!activeTab}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Column
          </button>
          <button
            onClick={persistCurrentTabNow}
            disabled={!activeTab || !hydrated || loadedTabId !== activeTab.id}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-cream-dark dark:border-white/10 text-navy dark:text-white hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Now
          </button>
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
