'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { PKTrackerSummary } from '@/lib/types';

interface TrackerManagerCardProps {
  tracker: PKTrackerSummary;
  canEdit: boolean;
}

const MANAGE_PAGE_TRACKERS = new Set([
  'client_updates',
  'fathom_videos',
  'sanity_checks',
  'pics_monitoring',
  'pingdom_tests',
  'google_ads_reports',
  'holiday_tracking',
]);

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

export default function TrackerManagerCard({ tracker, canEdit }: TrackerManagerCardProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState('');
  const [savingJsonEdit, setSavingJsonEdit] = useState(false);

  const manageRowsHref = MANAGE_PAGE_TRACKERS.has(tracker.tracker_type)
    ? `/performance/${tracker.tracker_type}/manage`
    : null;

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
          {manageRowsHref ? (
            <Link
              href={manageRowsHref}
              className="text-xs px-2 py-1 rounded bg-electric text-white hover:bg-electric/90"
            >
              Manage Rows
            </Link>
          ) : (
            <button
              onClick={toggleOpen}
              className="text-xs px-2 py-1 rounded bg-electric text-white hover:bg-electric/90"
            >
              {open ? 'Hide Rows' : 'Manage Rows'}
            </button>
          )}
        </div>
      </div>

      {open && !manageRowsHref && (
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

          {editingRowId && canEdit && (
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
