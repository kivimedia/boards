'use client';

import { useState, useEffect, useCallback } from 'react';

interface AnalyticsData {
  total: number;
  by_reason: Record<string, number>;
  by_sub_reason: Record<string, number>;
  by_source: Record<string, number>;
  by_event_type: Record<string, number>;
  estimated_revenue_lost: number;
  cards: {
    id: string;
    title: string;
    reason: string | null;
    sub_reason: string | null;
    source: string | null;
    event_type: string | null;
    event_date: string | null;
    estimated_value: number | null;
  }[];
}

export default function DidntBookAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/didnt-book');
      const json = await res.json();
      if (json.ok) setData(json.data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        No &quot;Didn&apos;t Book&quot; data yet.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Didn't Book" value={data.total.toString()} />
        <StatCard
          label="Revenue Lost"
          value={`$${data.estimated_revenue_lost.toLocaleString()}`}
          color="text-red-600 dark:text-red-400"
        />
        <StatCard label="Top Reason" value={getTopKey(data.by_reason)} />
        <StatCard label="Top Source" value={getTopKey(data.by_source)} />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Reason */}
        <BarChart title="By Reason" data={data.by_reason} color="bg-red-500" />

        {/* By Lead Source */}
        <BarChart title="By Lead Source" data={data.by_source} color="bg-blue-500" />

        {/* By Event Type */}
        <BarChart title="By Event Type" data={data.by_event_type} color="bg-purple-500" />

        {/* By Sub-Reason */}
        {Object.keys(data.by_sub_reason).length > 0 && (
          <BarChart title="By Sub-Reason" data={data.by_sub_reason} color="bg-amber-500" />
        )}
      </div>

      {/* Card List */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          All Cards ({data.cards.length})
        </h3>
        <div className="border rounded-lg overflow-hidden dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Client</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Reason</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Event Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Source</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Est. Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {data.cards.map((card) => (
                <tr key={card.id}>
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{card.title}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{card.reason || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{card.event_type || '—'}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{card.source || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                    {card.estimated_value ? `$${card.estimated_value.toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border rounded-lg p-4 dark:border-gray-700 bg-white dark:bg-gray-800/50">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color || 'text-gray-900 dark:text-gray-100'}`}>{value}</div>
    </div>
  );
}

function BarChart({ title, data, color }: { title: string; data: Record<string, number>; color: string }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries.length > 0 ? entries[0][1] : 1;

  return (
    <div className="border rounded-lg p-4 dark:border-gray-700 bg-white dark:bg-gray-800/50">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">{title}</h3>
      <div className="space-y-2">
        {entries.map(([key, count]) => (
          <div key={key}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-gray-600 dark:text-gray-300 truncate">{key}</span>
              <span className="text-gray-500 dark:text-gray-400 ml-2">{count}</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`${color} h-2 rounded-full transition-all`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-4">No data</div>
        )}
      </div>
    </div>
  );
}

function getTopKey(data: Record<string, number>): string {
  const entries = Object.entries(data);
  if (entries.length === 0) return '—';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}
