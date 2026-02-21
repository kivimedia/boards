'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { PKTrackerType, PK_TRACKER_FREQUENCIES } from '@/lib/types';

interface TrackerDetailContentProps {
  trackerType: PKTrackerType;
  label: string;
}

/** Columns to display for each tracker type. Keys are column names from the DB row. */
const TRACKER_COLUMNS: Record<string, Array<{ key: string; label: string; type?: 'date' | 'boolean' | 'link' }>> = {
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
};

/** Trackers that support AM filtering */
const AM_FILTERABLE = new Set([
  'fathom_videos', 'client_updates', 'sanity_checks', 'sanity_tests',
  'pics_monitoring', 'pingdom_tests', 'update_schedule', 'website_status',
]);

export default function TrackerDetailContent({ trackerType, label }: TrackerDetailContentProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [amFilter, setAmFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const columns = TRACKER_COLUMNS[trackerType] || [
    { key: 'id', label: 'ID' },
    { key: 'created_at', label: 'Created', type: 'date' as const },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: trackerType,
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (amFilter) params.set('am', amFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      const res = await fetch(`/api/performance/tracker?${params}`);
      if (res.ok) {
        const json = await res.json();
        const payload = json.data || json;
        setRows(payload.rows || []);
        setTotal(payload.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [trackerType, amFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Extract unique AM names from current data for the filter dropdown
  const amNames = useMemo(() => {
    const names = new Set<string>();
    rows.forEach(row => {
      const name = row.account_manager_name as string;
      if (name) names.add(name);
    });
    return Array.from(names).sort();
  }, [rows]);

  const totalPages = Math.ceil(total / pageSize);
  const frequency = PK_TRACKER_FREQUENCIES[trackerType] || '';

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Breadcrumb + info */}
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
              {total.toLocaleString()} total rows
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-white/5 rounded-xl border border-cream-dark/60 dark:border-white/10 p-3">
          {AM_FILTERABLE.has(trackerType) && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-navy/60 dark:text-white/50">AM:</label>
              <select
                value={amFilter}
                onChange={e => { setAmFilter(e.target.value); setPage(0); }}
                className="px-2 py-1.5 rounded-lg border border-cream-dark dark:border-white/10 bg-white dark:bg-white/5 text-sm text-navy dark:text-white min-w-[140px]"
              >
                <option value="">All</option>
                {amNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-navy/60 dark:text-white/50">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(0); }}
              className="px-2 py-1.5 rounded-lg border border-cream-dark dark:border-white/10 bg-white dark:bg-white/5 text-sm text-navy dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-navy/60 dark:text-white/50">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(0); }}
              className="px-2 py-1.5 rounded-lg border border-cream-dark dark:border-white/10 bg-white dark:bg-white/5 text-sm text-navy dark:text-white"
            />
          </div>
          {(amFilter || dateFrom || dateTo) && (
            <button
              onClick={() => { setAmFilter(''); setDateFrom(''); setDateTo(''); setPage(0); }}
              className="text-xs text-electric hover:text-electric/80 font-medium"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Data table */}
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="animate-pulse h-8 rounded bg-cream-dark/40 dark:bg-white/10" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-navy/50 dark:text-white/40">
                No data found{amFilter || dateFrom || dateTo ? ' for the selected filters' : ''}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-dark/60 dark:border-white/10 bg-cream-dark/20 dark:bg-white/5">
                    {columns.map(col => (
                      <th
                        key={col.key}
                        className="text-left py-2.5 px-3 font-medium text-navy/60 dark:text-white/50 whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr
                      key={(row.id as string) || idx}
                      className="border-b border-cream-dark/30 dark:border-white/5 last:border-0 hover:bg-cream-dark/10 dark:hover:bg-white/5 transition-colors"
                    >
                      {columns.map(col => (
                        <td key={col.key} className="py-2.5 px-3 text-navy dark:text-white/80 max-w-[200px]">
                          <CellRenderer value={row[col.key]} type={col.type} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-navy/50 dark:text-white/40">
              Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-cream-dark dark:border-white/10 text-navy/70 dark:text-white/60 disabled:opacity-30 hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors"
              >
                Prev
              </button>
              <span className="px-3 py-1.5 text-xs text-navy/50 dark:text-white/40">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-cream-dark dark:border-white/10 text-navy/70 dark:text-white/60 disabled:opacity-30 hover:bg-cream-dark/20 dark:hover:bg-white/5 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Cell renderer ---

function CellRenderer({ value, type }: { value: unknown; type?: 'date' | 'boolean' | 'link' }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-navy/20 dark:text-white/15">-</span>;
  }

  if (type === 'boolean') {
    const boolVal = value === true || value === 'true' || value === 'yes' || value === 'Yes' || value === 'done' || value === 'Done';
    return (
      <span className={`inline-block w-5 h-5 rounded-full text-center leading-5 text-xs font-bold ${
        boolVal
          ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400'
          : 'bg-red-100 text-red-500 dark:bg-red-500/20 dark:text-red-400'
      }`}>
        {boolVal ? '\u2713' : '\u2717'}
      </span>
    );
  }

  if (type === 'date' && typeof value === 'string') {
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return <span className="whitespace-nowrap">{d.toLocaleDateString()}</span>;
      }
    } catch {
      // fall through
    }
    return <span>{String(value)}</span>;
  }

  if (type === 'link' && typeof value === 'string' && value.startsWith('http')) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="text-electric hover:text-electric/80 underline truncate block max-w-[180px]"
      >
        Link
      </a>
    );
  }

  const str = String(value);
  if (str.length > 80) {
    return <span className="truncate block max-w-[200px]" title={str}>{str}</span>;
  }
  return <span>{str}</span>;
}
