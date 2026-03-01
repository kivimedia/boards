'use client';

import { useState, useEffect, useCallback } from 'react';

interface WeeklyDataPoint {
  week_start: string;
  count: number;
  duration_minutes: number;
}

interface EngagementStats {
  total_meetings: number;
  previous_period_meetings: number;
  avg_duration_minutes: number;
  action_items_total: number;
  weekly_data: WeeklyDataPoint[];
}

function formatDurationLabel(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function formatWeekLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Trend arrow component
function TrendIndicator({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const diff = current - previous;
  if (diff === 0) {
    return (
      <span className="text-gray-400 text-sm font-medium" title="No change">
        -
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span className="text-green-600 text-sm font-medium flex items-center gap-0.5">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
        +{diff}
      </span>
    );
  }
  return (
    <span className="text-red-600 text-sm font-medium flex items-center gap-0.5">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      {diff}
    </span>
  );
}

// Inline SVG bar chart - no external dependencies
function WeeklyBarChart({ data }: { data: WeeklyDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No data for this period
      </div>
    );
  }

  const W = 320;
  const H = 200;
  const pad = { top: 20, right: 12, bottom: 40, left: 32 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const barW = Math.min(28, (chartW / data.length) * 0.6);
  const gap = chartW / data.length;

  // Y-axis grid lines
  const gridSteps = Math.min(maxVal, 4);
  const gridLines = Array.from({ length: gridSteps }, (_, i) => {
    const ratio = (i + 1) / gridSteps;
    return {
      y: pad.top + chartH * (1 - ratio),
      label: String(Math.round(maxVal * ratio)),
    };
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Grid lines */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={pad.left}
              y1={g.y}
              x2={W - pad.right}
              y2={g.y}
              stroke="#e5e7eb"
              strokeWidth={0.5}
              strokeDasharray="4 2"
            />
            <text
              x={pad.left - 4}
              y={g.y + 3}
              textAnchor="end"
              fontSize={8}
              fill="#9ca3af"
              fontFamily="system-ui"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Baseline */}
        <line
          x1={pad.left}
          y1={pad.top + chartH}
          x2={W - pad.right}
          y2={pad.top + chartH}
          stroke="#e5e7eb"
          strokeWidth={0.5}
        />

        {/* Bars */}
        {data.map((d, i) => {
          const barH = (d.count / maxVal) * chartH;
          const x = pad.left + i * gap + (gap - barW) / 2;
          const y = pad.top + chartH - barH;
          const label = formatWeekLabel(d.week_start);

          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, 1)}
                rx={3}
                fill="#6366f1"
                opacity={0.85}
              />
              {/* Value above bar */}
              {d.count > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 4}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={600}
                  fill="#6366f1"
                  fontFamily="system-ui"
                >
                  {d.count}
                </text>
              )}
              {/* Week label */}
              <text
                x={x + barW / 2}
                y={pad.top + chartH + 14}
                textAnchor="middle"
                fontSize={7}
                fill="#9ca3af"
                fontFamily="system-ui"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ClientEngagementView({ clientId }: { clientId: string }) {
  const [stats, setStats] = useState<EngagementStats | null>(null);
  const [period, setPeriod] = useState<number>(30);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period > 0) params.set('period', String(period));
      const res = await fetch(
        `/api/meetings/engagement/${clientId}?${params}`
      );
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch engagement stats:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId, period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const periodOptions = [
    { label: '30 days', value: 30 },
    { label: '90 days', value: 90 },
    { label: 'All time', value: 0 },
  ];

  if (loading) {
    return (
      <div className="space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Client Engagement
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 animate-pulse"
            >
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2" />
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const trendDiff = stats.total_meetings - stats.previous_period_meetings;

  return (
    <div className="space-y-4 mb-6">
      {/* Header + Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Client Engagement
        </h3>
        <div className="flex gap-1">
          {periodOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                period === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Meetings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Total Meetings
          </p>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.total_meetings}
            </p>
            <TrendIndicator
              current={stats.total_meetings}
              previous={stats.previous_period_meetings}
            />
          </div>
        </div>

        {/* Avg Duration */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Avg Duration
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatDurationLabel(stats.avg_duration_minutes)}
          </p>
        </div>

        {/* Action Items */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Action Items
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.action_items_total}
          </p>
        </div>

        {/* Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
            Trend
          </p>
          <p
            className={`text-2xl font-bold ${
              trendDiff > 0
                ? 'text-green-600'
                : trendDiff < 0
                ? 'text-red-600'
                : 'text-gray-400'
            }`}
          >
            {trendDiff > 0 ? `+${trendDiff}` : trendDiff < 0 ? String(trendDiff) : '-'}
          </p>
          {period > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              vs prev {period} days
            </p>
          )}
        </div>
      </div>

      {/* Weekly Bar Chart */}
      <WeeklyBarChart data={stats.weekly_data} />
    </div>
  );
}
