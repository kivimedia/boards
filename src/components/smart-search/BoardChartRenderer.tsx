'use client';

import { useMemo } from 'react';
import type { BoardChartData, BoardChartDataPoint } from '@/lib/types';

const CHART_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
];

function getColor(index: number, point: BoardChartDataPoint): string {
  return point.color || CHART_COLORS[index % CHART_COLORS.length];
}

// ── Bar Chart ──────────────────────────────────────────────

function BarChartSvg({ data, valueLabel }: { data: BoardChartDataPoint[]; valueLabel?: string }) {
  const chart = useMemo(() => {
    const W = 320, H = 200;
    const pad = { top: 24, right: 12, bottom: 36, left: 36 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;
    const maxVal = Math.max(...data.map(d => d.value), 1);
    const barW = Math.min(32, (cw / data.length) * 0.65);
    const gap = cw / data.length;

    // Y-axis grid: 4 lines
    const gridLines = [0.25, 0.5, 0.75, 1].map(r => ({
      y: pad.top + ch * (1 - r),
      label: String(Math.round(maxVal * r)),
    }));

    return { W, H, pad, cw, ch, maxVal, barW, gap, gridLines };
  }, [data]);

  return (
    <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full">
      {/* Grid lines */}
      {chart.gridLines.map((g, i) => (
        <g key={i}>
          <line
            x1={chart.pad.left} y1={g.y}
            x2={chart.W - chart.pad.right} y2={g.y}
            stroke="currentColor" className="text-cream-dark dark:text-slate-700"
            strokeWidth={0.5} strokeDasharray="4 2"
          />
          <text
            x={chart.pad.left - 4} y={g.y + 3}
            textAnchor="end" fontSize={8}
            className="fill-navy/30 dark:fill-slate-500"
            fontFamily="system-ui"
          >{g.label}</text>
        </g>
      ))}
      {/* Baseline */}
      <line
        x1={chart.pad.left} y1={chart.pad.top + chart.ch}
        x2={chart.W - chart.pad.right} y2={chart.pad.top + chart.ch}
        stroke="currentColor" className="text-cream-dark dark:text-slate-700" strokeWidth={0.5}
      />

      {/* Bars */}
      {data.map((d, i) => {
        const barH = (d.value / chart.maxVal) * chart.ch;
        const x = chart.pad.left + i * chart.gap + (chart.gap - chart.barW) / 2;
        const y = chart.pad.top + chart.ch - barH;
        const label = d.label.length > 8 ? d.label.slice(0, 7) + '\u2026' : d.label;

        return (
          <g key={i}>
            <rect
              x={x} y={y} width={chart.barW} height={Math.max(barH, 1)}
              rx={3} fill={getColor(i, d)} opacity={0.85}
            />
            {/* Value label above bar */}
            <text
              x={x + chart.barW / 2} y={y - 4}
              textAnchor="middle" fontSize={8} fontWeight={600}
              className="fill-navy/60 dark:fill-slate-300"
              fontFamily="system-ui"
            >{d.value}{valueLabel ? ` ${valueLabel}` : ''}</text>
            {/* X label */}
            <text
              x={x + chart.barW / 2} y={chart.pad.top + chart.ch + 14}
              textAnchor="middle" fontSize={7.5}
              className="fill-navy/40 dark:fill-slate-500"
              fontFamily="system-ui"
            >{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Pie (Donut) Chart ──────────────────────────────────────

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function PieChartSvg({ data }: { data: BoardChartDataPoint[] }) {
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  if (total === 0) return null;

  const CX = 100, CY = 100, OUTER = 70, INNER = 40;

  let currentAngle = 0;
  const arcs = data.map((d, i) => {
    const angle = (d.value / total) * 360;
    const startAngle = currentAngle;
    // Avoid full 360 single arc (SVG can't draw it)
    const endAngle = currentAngle + Math.min(angle, 359.99);
    currentAngle += angle;
    return { ...d, startAngle, endAngle, color: getColor(i, d), index: i };
  });

  return (
    <svg viewBox="0 0 320 200" className="w-full">
      {/* Donut arcs */}
      {arcs.map((arc) => (
        <path
          key={arc.index}
          d={describeArc(CX, CY, OUTER, arc.startAngle, arc.endAngle)}
          fill="none" stroke={arc.color} strokeWidth={OUTER - INNER}
          strokeLinecap="butt"
        />
      ))}
      {/* Center total */}
      <text x={CX} y={CY - 4} textAnchor="middle" fontSize={16} fontWeight={700}
        className="fill-navy dark:fill-slate-100" fontFamily="system-ui"
      >{total}</text>
      <text x={CX} y={CY + 10} textAnchor="middle" fontSize={8}
        className="fill-navy/40 dark:fill-slate-500" fontFamily="system-ui"
      >total</text>

      {/* Legend */}
      {data.map((d, i) => {
        const y = 20 + i * 18;
        if (y > 190) return null;
        const label = d.label.length > 14 ? d.label.slice(0, 13) + '\u2026' : d.label;
        const pct = Math.round((d.value / total) * 100);
        return (
          <g key={i}>
            <circle cx={195} cy={y} r={4} fill={getColor(i, d)} />
            <text x={204} y={y + 3.5} fontSize={8.5}
              className="fill-navy/70 dark:fill-slate-300" fontFamily="system-ui"
            >{label} ({pct}%)</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Line Chart ─────────────────────────────────────────────

function LineChartSvg({ data, valueLabel }: { data: BoardChartDataPoint[]; valueLabel?: string }) {
  const chart = useMemo(() => {
    const W = 320, H = 200;
    const pad = { top: 20, right: 12, bottom: 36, left: 36 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;
    const maxVal = Math.max(...data.map(d => d.value), 1);
    const yMax = Math.ceil(maxVal / 5) * 5 || 5;

    const points = data.map((d, i) => ({
      x: pad.left + (data.length > 1 ? (i / (data.length - 1)) * cw : cw / 2),
      y: pad.top + (1 - d.value / yMax) * ch,
    }));

    const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

    // Area path
    const baseline = pad.top + ch;
    const areaPath = `M ${points[0].x},${baseline} ` +
      points.map(p => `L ${p.x},${p.y}`).join(' ') +
      ` L ${points[points.length - 1].x},${baseline} Z`;

    // Grid
    const gridLines = [0.25, 0.5, 0.75, 1].map(r => ({
      y: pad.top + ch * (1 - r),
      label: String(Math.round(yMax * r)),
    }));

    // X labels: show at most 6
    const step = Math.max(1, Math.floor(data.length / 6));

    return { W, H, pad, ch, yMax, points, polyline, areaPath, gridLines, step };
  }, [data]);

  return (
    <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="w-full">
      <defs>
        <linearGradient id="chartAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.18} />
          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {chart.gridLines.map((g, i) => (
        <g key={i}>
          <line
            x1={chart.pad.left} y1={g.y}
            x2={chart.W - chart.pad.right} y2={g.y}
            stroke="currentColor" className="text-cream-dark dark:text-slate-700"
            strokeWidth={0.5} strokeDasharray="4 2"
          />
          <text x={chart.pad.left - 4} y={g.y + 3} textAnchor="end" fontSize={8}
            className="fill-navy/30 dark:fill-slate-500" fontFamily="system-ui"
          >{g.label}</text>
        </g>
      ))}
      {/* Baseline */}
      <line
        x1={chart.pad.left} y1={chart.pad.top + chart.ch}
        x2={chart.W - chart.pad.right} y2={chart.pad.top + chart.ch}
        stroke="currentColor" className="text-cream-dark dark:text-slate-700" strokeWidth={0.5}
      />

      {/* Area fill */}
      <path d={chart.areaPath} fill="url(#chartAreaGrad)" />

      {/* Line */}
      <polyline
        points={chart.polyline}
        fill="none" stroke="#6366f1" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round"
        className="dark:stroke-indigo-400"
      />

      {/* Data points */}
      {chart.points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5}
          className="fill-white dark:fill-slate-800 stroke-indigo-500 dark:stroke-indigo-400"
          strokeWidth={1.5}
        />
      ))}

      {/* X labels */}
      {data.map((d, i) => {
        if (i % chart.step !== 0 && i !== data.length - 1) return null;
        const label = d.label.length > 8 ? d.label.slice(0, 7) + '\u2026' : d.label;
        return (
          <text key={i}
            x={chart.points[i].x} y={chart.pad.top + chart.ch + 14}
            textAnchor="middle" fontSize={7.5}
            className="fill-navy/40 dark:fill-slate-500" fontFamily="system-ui"
          >{label}</text>
        );
      })}
    </svg>
  );
}

// ── Trend Badge ────────────────────────────────────────────

function TrendBadge({ trend }: { trend: string }) {
  const isPositive = trend.startsWith('+') || trend.toLowerCase().includes('up');
  const isNegative = trend.startsWith('-') || trend.toLowerCase().includes('down');

  return (
    <span className={`
      inline-flex items-center gap-0.5 text-[10px] font-body px-1.5 py-0.5 rounded-full
      ${isPositive ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' :
        isNegative ? 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20' :
        'text-navy/50 dark:text-slate-400 bg-cream-dark/50 dark:bg-slate-800/50'}
    `}>
      {isPositive && (
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
        </svg>
      )}
      {isNegative && (
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      )}
      {trend}
    </span>
  );
}

// ── Main Renderer ──────────────────────────────────────────

interface BoardChartRendererProps {
  chartData: BoardChartData;
}

export default function BoardChartRenderer({ chartData }: BoardChartRendererProps) {
  const { chartType, title, data, valueLabel, trend } = chartData;

  if (!data || data.length < 2) return null;

  return (
    <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 p-3 mt-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-heading font-semibold text-navy dark:text-slate-200 truncate">
          {title}
        </h4>
        {trend && <TrendBadge trend={trend} />}
      </div>

      {/* Chart */}
      {chartType === 'bar' && <BarChartSvg data={data} valueLabel={valueLabel} />}
      {chartType === 'pie' && <PieChartSvg data={data} />}
      {chartType === 'line' && <LineChartSvg data={data} valueLabel={valueLabel} />}
    </div>
  );
}
