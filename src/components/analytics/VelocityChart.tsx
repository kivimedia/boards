'use client';

import { useState, useEffect, useMemo } from 'react';

interface VelocityPeriod {
  period_start: string;
  period_end: string;
  cards_completed: number;
  cards_added: number;
  avg_cycle_time_hours: number | null;
}

interface VelocitySummary {
  total_completed: number;
  total_added: number;
  avg_velocity_per_sprint: number;
  avg_cycle_time_hours: number | null;
  sprint_count: number;
  sprint_days: number;
}

interface VelocityChartProps {
  boardId: string;
}

type SprintDuration = 7 | 14 | 30;

export default function VelocityChart({ boardId }: VelocityChartProps) {
  const [periods, setPeriods] = useState<VelocityPeriod[]>([]);
  const [summary, setSummary] = useState<VelocitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sprintDays, setSprintDays] = useState<SprintDuration>(7);

  useEffect(() => {
    fetchVelocity();
  }, [boardId, sprintDays]);

  const fetchVelocity = async () => {
    setLoading(true);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 90); // 3 months lookback

      const params = new URLSearchParams({
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0],
        sprint_days: String(sprintDays),
      });

      const res = await fetch(`/api/boards/${boardId}/velocity?${params}`);
      if (res.ok) {
        const json = await res.json();
        setPeriods(json.data?.periods ?? []);
        setSummary(json.data?.summary ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch velocity:', err);
    } finally {
      setLoading(false);
    }
  };

  const maxCompleted = useMemo(
    () => Math.max(1, ...periods.map((p) => p.cards_completed)),
    [periods]
  );
  const maxAdded = useMemo(
    () => Math.max(1, ...periods.map((p) => p.cards_added)),
    [periods]
  );
  const chartMax = Math.max(maxCompleted, maxAdded);

  const avgVelocity = summary?.avg_velocity_per_sprint ?? 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-navy/40 dark:text-slate-500 font-body">
        No velocity data available. Activity logs are needed to calculate velocity.
      </div>
    );
  }

  const chartWidth = 700;
  const chartHeight = 250;
  const padding = { top: 20, right: 20, bottom: 60, left: 50 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const barGroupWidth = periods.length > 0 ? innerWidth / periods.length : 0;
  const barWidth = Math.min(barGroupWidth * 0.35, 30);
  const gap = 3;

  // Y-axis ticks
  const yTicks = [0, Math.round(chartMax * 0.25), Math.round(chartMax * 0.5), Math.round(chartMax * 0.75), chartMax];

  return (
    <div className="space-y-4">
      {/* Sprint duration selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-200 font-heading">
          Velocity (last 90 days)
        </h3>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-cream-dark/40 dark:bg-slate-800">
          {([7, 14, 30] as SprintDuration[]).map((d) => (
            <button
              key={d}
              onClick={() => setSprintDays(d)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                sprintDays === d
                  ? 'bg-white dark:bg-slate-700 text-navy dark:text-slate-100 shadow-sm'
                  : 'text-navy/50 dark:text-slate-400 hover:text-navy/70 dark:hover:text-slate-300'
              }`}
            >
              {d === 7 ? 'Weekly' : d === 14 ? 'Biweekly' : 'Monthly'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Avg Velocity"
            value={String(summary.avg_velocity_per_sprint)}
            sublabel={`cards/${sprintDays === 7 ? 'week' : sprintDays === 14 ? '2wk' : 'month'}`}
          />
          <StatCard
            label="Total Completed"
            value={String(summary.total_completed)}
            sublabel="cards"
          />
          <StatCard
            label="Total Added"
            value={String(summary.total_added)}
            sublabel="cards"
          />
          <StatCard
            label="Avg Cycle Time"
            value={summary.avg_cycle_time_hours !== null ? `${summary.avg_cycle_time_hours}` : '—'}
            sublabel="hours"
          />
        </div>
      )}

      {/* Chart */}
      <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {yTicks.map((tick) => {
            const y = padding.top + innerHeight - (tick / chartMax) * innerHeight;
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="currentColor"
                  className="text-cream-dark dark:text-slate-700"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="text-navy/30 dark:text-slate-500 fill-current"
                  fontSize="10"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Average velocity line */}
          {avgVelocity > 0 && (
            <line
              x1={padding.left}
              y1={padding.top + innerHeight - (avgVelocity / chartMax) * innerHeight}
              x2={chartWidth - padding.right}
              y2={padding.top + innerHeight - (avgVelocity / chartMax) * innerHeight}
              stroke="#3b82f6"
              strokeWidth="1.5"
              strokeDasharray="6 3"
              opacity="0.5"
            />
          )}

          {/* Bars */}
          {periods.map((period, i) => {
            const groupX = padding.left + i * barGroupWidth + barGroupWidth / 2;
            const completedHeight = (period.cards_completed / chartMax) * innerHeight;
            const addedHeight = (period.cards_added / chartMax) * innerHeight;

            const label = formatPeriodLabel(period.period_start, sprintDays);

            return (
              <g key={i}>
                {/* Completed bar (green) */}
                <rect
                  x={groupX - barWidth - gap / 2}
                  y={padding.top + innerHeight - completedHeight}
                  width={barWidth}
                  height={Math.max(0, completedHeight)}
                  rx={3}
                  fill="#10b981"
                  opacity={0.85}
                />

                {/* Added bar (blue) */}
                <rect
                  x={groupX + gap / 2}
                  y={padding.top + innerHeight - addedHeight}
                  width={barWidth}
                  height={Math.max(0, addedHeight)}
                  rx={3}
                  fill="#3b82f6"
                  opacity={0.6}
                />

                {/* Completed count label */}
                {period.cards_completed > 0 && (
                  <text
                    x={groupX - barWidth / 2 - gap / 2}
                    y={padding.top + innerHeight - completedHeight - 4}
                    textAnchor="middle"
                    className="fill-green-600 dark:fill-green-400"
                    fontSize="9"
                    fontWeight="600"
                  >
                    {period.cards_completed}
                  </text>
                )}

                {/* X-axis label */}
                <text
                  x={groupX}
                  y={chartHeight - padding.bottom + 16}
                  textAnchor="middle"
                  className="text-navy/40 dark:text-slate-500 fill-current"
                  fontSize="9"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-500 opacity-85" />
            <span className="text-[10px] text-navy/50 dark:text-slate-400 font-body">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-500 opacity-60" />
            <span className="text-[10px] text-navy/50 dark:text-slate-400 font-body">Added</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-0.5 border-t-2 border-dashed border-blue-500 opacity-50" />
            <span className="text-[10px] text-navy/50 dark:text-slate-400 font-body">Avg Velocity</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="bg-cream/50 dark:bg-navy/50 rounded-xl border border-cream-dark/50 dark:border-slate-700/50 p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-navy/40 dark:text-slate-500 font-semibold mb-1">
        {label}
      </div>
      <div className="text-xl font-bold text-navy dark:text-slate-100 font-heading">
        {value}
      </div>
      <div className="text-[10px] text-navy/30 dark:text-slate-500">
        {sublabel}
      </div>
    </div>
  );
}

function formatPeriodLabel(dateStr: string, sprintDays: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  if (sprintDays === 30) return month;
  return `${month} ${day}`;
}
