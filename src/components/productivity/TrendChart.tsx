'use client';

import { useMemo } from 'react';
import { useChartColors } from '@/hooks/useChartColors';

interface TrendDataPoint {
  date: string;
  completed: number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  loading?: boolean;
  height?: number;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function TrendChart({ data, loading, height = 240 }: TrendChartProps) {
  const colors = useChartColors();
  const chartData = useMemo(() => {
    if (data.length === 0) return null;

    const width = 700;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 40;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const maxVal = Math.max(...data.map((d) => d.completed), 1);
    // Round up to nice number
    const yMax = Math.ceil(maxVal / 5) * 5 || 5;

    const points = data.map((d, i) => {
      const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * chartWidth;
      const y = paddingTop + (1 - d.completed / yMax) * chartHeight;
      return { x, y, ...d };
    });

    // Build polyline path
    const linePath = points.map((p) => `${p.x},${p.y}`).join(' ');

    // Area path (fill beneath line)
    const areaPath = [
      `M ${points[0].x},${paddingTop + chartHeight}`,
      ...points.map((p) => `L ${p.x},${p.y}`),
      `L ${points[points.length - 1].x},${paddingTop + chartHeight}`,
      'Z',
    ].join(' ');

    // Y-axis grid lines
    const yGridCount = 4;
    const yGridLines = Array.from({ length: yGridCount + 1 }).map((_, i) => {
      const val = Math.round((yMax / yGridCount) * i);
      const y = paddingTop + (1 - val / yMax) * chartHeight;
      return { val, y };
    });

    // X-axis labels (show at most 8)
    const xLabelStep = Math.max(1, Math.floor(data.length / 8));
    const xLabels = data
      .map((d, i) => ({
        label: formatDateLabel(d.date),
        x: paddingLeft + (i / Math.max(data.length - 1, 1)) * chartWidth,
        show: i % xLabelStep === 0 || i === data.length - 1,
      }))
      .filter((l) => l.show);

    return {
      width,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      chartWidth,
      chartHeight,
      points,
      linePath,
      areaPath,
      yGridLines,
      xLabels,
    };
  }, [data, height]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Completion Trend</h3>
        </div>
        <div className="p-5 flex items-center justify-center" style={{ height }}>
          <div className="animate-pulse text-navy/30 dark:text-slate-600 text-sm font-body">Loading chart...</div>
        </div>
      </div>
    );
  }

  if (!chartData || data.length === 0) {
    return (
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Completion Trend</h3>
        </div>
        <div className="p-8 text-center text-navy/40 dark:text-slate-500 text-sm font-body" style={{ minHeight: height }}>
          No trend data available
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Completion Trend</h3>
      </div>
      <div className="p-5 overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartData.width} ${height}`}
          className="w-full"
          style={{ minWidth: 400, maxHeight: height }}
        >
          {/* Y grid lines */}
          {chartData.yGridLines.map((gl) => (
            <g key={gl.val}>
              <line
                x1={chartData.paddingLeft}
                y1={gl.y}
                x2={chartData.width - chartData.paddingRight}
                y2={gl.y}
                stroke={colors.grid}
                strokeWidth="1"
                strokeDasharray="4 2"
              />
              <text
                x={chartData.paddingLeft - 8}
                y={gl.y + 4}
                textAnchor="end"
                className="fill-navy/40 dark:fill-slate-500 text-[10px] font-body"
              >
                {gl.val}
              </text>
            </g>
          ))}

          {/* Area fill */}
          <path d={chartData.areaPath} fill="url(#areaGradient)" />

          {/* Gradient definition */}
          <defs>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={colors.gradientStart} stopOpacity={colors.gradientStartOpacity} />
              <stop offset="100%" stopColor={colors.gradientStart} stopOpacity={colors.gradientEndOpacity} />
            </linearGradient>
          </defs>

          {/* Line */}
          <polyline
            points={chartData.linePath}
            fill="none"
            stroke={colors.primary}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {chartData.points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3"
              fill={colors.pointFill}
              stroke={colors.primary}
              strokeWidth="2"
            />
          ))}

          {/* X-axis labels */}
          {chartData.xLabels.map((xl, i) => (
            <text
              key={i}
              x={xl.x}
              y={height - 10}
              textAnchor="middle"
              className="fill-navy/40 dark:fill-slate-500 text-[10px] font-body"
            >
              {xl.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
