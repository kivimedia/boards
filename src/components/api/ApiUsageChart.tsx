'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ApiKey } from '@/lib/types';
import { useChartColors } from '@/hooks/useChartColors';

interface DailyStats {
  total: number;
  success: number;
  error: number;
}

interface UsageData {
  key_id: string;
  days: number;
  total_requests: number;
  daily: Record<string, DailyStats>;
}

interface ApiUsageChartProps {
  apiKeys: ApiKey[];
}

export default function ApiUsageChart({ apiKeys }: ApiUsageChartProps) {
  const colors = useChartColors();
  const [selectedKeyId, setSelectedKeyId] = useState<string>(apiKeys[0]?.id || '');
  const [days, setDays] = useState(7);
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!selectedKeyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/usage?key_id=${selectedKeyId}&days=${days}`);
      const json = await res.json();
      if (json.data) {
        setData(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedKeyId, days]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Build chart data from last N days
  const chartDays: { date: string; label: string; total: number; success: number; error: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().substring(0, 10);
    const stats = data?.daily[dateStr];
    chartDays.push({
      date: dateStr,
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      total: stats?.total ?? 0,
      success: stats?.success ?? 0,
      error: stats?.error ?? 0,
    });
  }

  const maxValue = Math.max(...chartDays.map((d) => d.total), 1);

  if (apiKeys.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
        Create an API key to see usage statistics.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">API Usage</h3>
        <div className="flex items-center gap-2">
          <select
            value={selectedKeyId}
            onChange={(e) => setSelectedKeyId(e.target.value)}
            className="appearance-none px-3 py-1.5 pr-8 rounded-lg bg-white dark:bg-dark-surface border-2 border-cream-dark dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:border-electric"
          >
            {apiKeys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.name} ({key.key_prefix}...)
              </option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="appearance-none px-3 py-1.5 pr-8 rounded-lg bg-white dark:bg-dark-surface border-2 border-cream-dark dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:border-electric"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading...
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-cream/50 dark:bg-navy/50 rounded-xl p-3 text-center">
                <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">
                  {data?.total_requests ?? 0}
                </p>
                <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5">Total Requests</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-heading font-bold text-green-700">
                  {chartDays.reduce((sum, d) => sum + d.success, 0)}
                </p>
                <p className="text-xs text-green-600 font-body mt-0.5">Successful</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-heading font-bold text-red-700">
                  {chartDays.reduce((sum, d) => sum + d.error, 0)}
                </p>
                <p className="text-xs text-red-600 font-body mt-0.5">Errors</p>
              </div>
            </div>

            {/* SVG Bar Chart */}
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${Math.max(chartDays.length * 50, 350)} 200`}
                className="w-full"
                style={{ minWidth: `${chartDays.length * 50}px` }}
              >
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <g key={ratio}>
                    <line
                      x1="0"
                      y1={160 - ratio * 140}
                      x2={chartDays.length * 50}
                      y2={160 - ratio * 140}
                      stroke={colors.grid}
                      strokeWidth="1"
                      strokeDasharray={ratio > 0 ? '4,4' : '0'}
                    />
                    <text
                      x={chartDays.length * 50 + 4}
                      y={160 - ratio * 140 + 4}
                      className="text-[9px] fill-navy/30 dark:fill-slate-600 font-body"
                    >
                      {Math.round(maxValue * ratio)}
                    </text>
                  </g>
                ))}

                {/* Bars */}
                {chartDays.map((day, i) => {
                  const barHeight = (day.total / maxValue) * 140;
                  const successHeight = (day.success / maxValue) * 140;
                  const x = i * 50 + 10;
                  const barWidth = 30;

                  return (
                    <g key={day.date}>
                      {/* Error portion (total - success) */}
                      {day.error > 0 && (
                        <rect
                          x={x}
                          y={160 - barHeight}
                          width={barWidth}
                          height={barHeight}
                          rx="4"
                          fill={colors.error}
                        />
                      )}
                      {/* Success portion */}
                      <rect
                        x={x}
                        y={160 - successHeight}
                        width={barWidth}
                        height={successHeight}
                        rx="4"
                        fill={colors.success}
                        opacity="0.8"
                      />
                      {/* Value label */}
                      {day.total > 0 && (
                        <text
                          x={x + barWidth / 2}
                          y={155 - barHeight}
                          textAnchor="middle"
                          className="text-[9px] fill-navy/60 dark:fill-slate-400 font-body"
                        >
                          {day.total}
                        </text>
                      )}
                      {/* Date label */}
                      <text
                        x={x + barWidth / 2}
                        y={178}
                        textAnchor="middle"
                        className="text-[9px] fill-navy/40 dark:fill-slate-500 font-body"
                      >
                        {day.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-electric/80" />
                <span className="text-xs text-navy/50 dark:text-slate-400 font-body">Success</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-red-300" />
                <span className="text-xs text-navy/50 dark:text-slate-400 font-body">Errors</span>
              </div>
            </div>

            {/* Rate Limit Info */}
            {selectedKeyId && apiKeys.find((k) => k.id === selectedKeyId) && (
              <div className="mt-4 pt-4 border-t border-cream-dark dark:border-slate-700">
                <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
                  Rate limits: {apiKeys.find((k) => k.id === selectedKeyId)?.rate_limit_per_minute} req/min, {apiKeys.find((k) => k.id === selectedKeyId)?.rate_limit_per_day} req/day
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
