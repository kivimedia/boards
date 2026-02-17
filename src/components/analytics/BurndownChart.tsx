'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useChartColors } from '@/hooks/useChartColors';

interface BurndownDataPoint {
  date: string;
  remaining: number;
  ideal: number;
}

interface BurndownChartProps {
  boardId: string;
  startDate?: string;
  endDate?: string;
}

export default function BurndownChart({ boardId, startDate, endDate }: BurndownChartProps) {
  const [data, setData] = useState<BurndownDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const colors = useChartColors();

  const defaultStart = useMemo(() => {
    if (startDate) return startDate;
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  }, [startDate]);

  const defaultEnd = useMemo(() => {
    if (endDate) return endDate;
    return new Date().toISOString().split('T')[0];
  }, [endDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/boards/${boardId}/burndown?start_date=${defaultStart}&end_date=${defaultEnd}`
      );
      const json = await res.json();
      if (json.data) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [boardId, defaultStart, defaultEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="animate-pulse h-64 rounded-xl bg-cream-dark/40 dark:bg-slate-800/40" />
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface flex items-center justify-center">
        <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No burndown data available.</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => Math.max(d.remaining, d.ideal)));
  const chartWidth = 600;
  const chartHeight = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const xStep = data.length > 1 ? innerWidth / (data.length - 1) : innerWidth;
  const yScale = maxValue > 0 ? innerHeight / maxValue : 1;

  // Build SVG path for actual line
  const actualPath = data
    .map((d, i) => {
      const x = padding.left + i * xStep;
      const y = padding.top + innerHeight - d.remaining * yScale;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Build SVG path for ideal line
  const idealPath = data
    .map((d, i) => {
      const x = padding.left + i * xStep;
      const y = padding.top + innerHeight - d.ideal * yScale;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Area fill for actual
  const actualArea =
    actualPath +
    ` L ${padding.left + (data.length - 1) * xStep} ${padding.top + innerHeight}` +
    ` L ${padding.left} ${padding.top + innerHeight} Z`;

  // Y-axis ticks
  const yTicks = [0, Math.round(maxValue / 2), maxValue];

  // X-axis labels (show first, middle, last)
  const xLabels: { index: number; label: string }[] = [];
  if (data.length > 0) {
    xLabels.push({ index: 0, label: data[0].date.slice(5) });
    if (data.length > 2) {
      const mid = Math.floor(data.length / 2);
      xLabels.push({ index: mid, label: data[mid].date.slice(5) });
    }
    if (data.length > 1) {
      xLabels.push({ index: data.length - 1, label: data[data.length - 1].date.slice(5) });
    }
  }

  return (
    <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Burndown Chart</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-electric rounded" />
            <span className="text-[10px] text-navy/50 dark:text-slate-400 font-body">Actual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-navy/20 rounded" style={{ strokeDasharray: '4 2' }} />
            <span className="text-[10px] text-navy/50 dark:text-slate-400 font-body">Ideal</span>
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y = padding.top + innerHeight - tick * yScale;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                stroke={colors.grid}
                strokeWidth={0.5}
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-navy/30"
                fontSize={9}
                fontFamily="system-ui"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map(({ index, label }) => {
          const x = padding.left + index * xStep;
          return (
            <text
              key={index}
              x={x}
              y={padding.top + innerHeight + 18}
              textAnchor="middle"
              className="fill-navy/30"
              fontSize={9}
              fontFamily="system-ui"
            >
              {label}
            </text>
          );
        })}

        {/* Actual area fill */}
        <path d={actualArea} fill={colors.primary} opacity={0.08} />

        {/* Ideal line (dashed) */}
        <path d={idealPath} fill="none" stroke={colors.secondary} strokeWidth={1.5} strokeDasharray="6 3" opacity={0.2} />

        {/* Actual line */}
        <path d={actualPath} fill="none" stroke={colors.primary} strokeWidth={2} />

        {/* Data points for actual */}
        {data.map((d, i) => {
          const x = padding.left + i * xStep;
          const y = padding.top + innerHeight - d.remaining * yScale;
          return (
            <circle key={i} cx={x} cy={y} r={2.5} fill={colors.primary} />
          );
        })}
      </svg>

      <div className="flex items-center justify-between mt-2 text-xs text-navy/40 dark:text-slate-500 font-body">
        <span>{data[0]?.date}</span>
        <span>
          Remaining: <strong className="text-navy dark:text-slate-100">{data[data.length - 1]?.remaining ?? 0}</strong> tasks
        </span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
