'use client';

import { useState, useEffect, useMemo } from 'react';

interface TrendPoint {
  week_start: string;
  avg_rating: number;
  response_count: number;
}

interface RatingDistribution {
  rating: number;
  count: number;
}

interface SatisfactionSummary {
  total_responses: number;
  avg_rating: number;
  period_days: number;
}

type Period = 30 | 60 | 90;

export default function SatisfactionTrends() {
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [distribution, setDistribution] = useState<RatingDistribution[]>([]);
  const [summary, setSummary] = useState<SatisfactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(90);

  useEffect(() => {
    fetchTrends();
  }, [period]);

  const fetchTrends = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/satisfaction/trends?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setTrend(json.data?.trend ?? []);
        setDistribution(json.data?.distribution ?? []);
        setSummary(json.data?.summary ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch satisfaction trends:', err);
    } finally {
      setLoading(false);
    }
  };

  const maxResponses = useMemo(
    () => Math.max(1, ...trend.map((t) => t.response_count)),
    [trend]
  );

  const totalDistribution = useMemo(
    () => distribution.reduce((s, d) => s + d.count, 0) || 1,
    [distribution]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  if (trend.length === 0 && (summary?.total_responses ?? 0) === 0) {
    return (
      <div className="text-center py-12 text-sm text-navy/40 dark:text-slate-500 font-body">
        No satisfaction data collected yet. Ratings will appear here once clients submit feedback.
      </div>
    );
  }

  const chartWidth = 700;
  const chartHeight = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Build trend line path
  const linePoints = trend.map((t, i) => {
    const x = padding.left + (i / Math.max(1, trend.length - 1)) * innerWidth;
    const y = padding.top + innerHeight - ((t.avg_rating - 1) / 4) * innerHeight; // 1-5 scale
    return { x, y, data: t };
  });

  const linePath = linePoints.length > 1
    ? `M ${linePoints.map((p) => `${p.x},${p.y}`).join(' L ')}`
    : '';

  const areaPath = linePath
    ? `${linePath} L ${linePoints[linePoints.length - 1].x},${padding.top + innerHeight} L ${linePoints[0].x},${padding.top + innerHeight} Z`
    : '';

  const starColor = (rating: number) => {
    if (rating >= 4.5) return 'text-green-500';
    if (rating >= 3.5) return 'text-yellow-500';
    if (rating >= 2.5) return 'text-orange-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-200 font-heading">
          Client Satisfaction Trends
        </h3>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-cream-dark/40 dark:bg-slate-800">
          {([30, 60, 90] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                period === p
                  ? 'bg-white dark:bg-slate-700 text-navy dark:text-slate-100 shadow-sm'
                  : 'text-navy/50 dark:text-slate-400 hover:text-navy/70 dark:hover:text-slate-300'
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-cream/50 dark:bg-navy/50 rounded-xl border border-cream-dark/50 dark:border-slate-700/50 p-4 text-center">
            <div className="text-[10px] uppercase tracking-wider text-navy/40 dark:text-slate-500 font-semibold mb-1">
              Average Rating
            </div>
            <div className={`text-2xl font-bold font-heading ${starColor(summary.avg_rating)}`}>
              {summary.avg_rating > 0 ? summary.avg_rating.toFixed(1) : '—'}
            </div>
            <div className="flex justify-center gap-0.5 mt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={`text-sm ${star <= Math.round(summary.avg_rating) ? 'text-yellow-400' : 'text-navy/10 dark:text-slate-700'}`}
                >
                  ★
                </span>
              ))}
            </div>
          </div>
          <div className="bg-cream/50 dark:bg-navy/50 rounded-xl border border-cream-dark/50 dark:border-slate-700/50 p-4 text-center">
            <div className="text-[10px] uppercase tracking-wider text-navy/40 dark:text-slate-500 font-semibold mb-1">
              Total Responses
            </div>
            <div className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">
              {summary.total_responses}
            </div>
            <div className="text-[10px] text-navy/30 dark:text-slate-500 mt-1">
              last {summary.period_days} days
            </div>
          </div>
          <div className="bg-cream/50 dark:bg-navy/50 rounded-xl border border-cream-dark/50 dark:border-slate-700/50 p-4 text-center">
            <div className="text-[10px] uppercase tracking-wider text-navy/40 dark:text-slate-500 font-semibold mb-1">
              Avg/Week
            </div>
            <div className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">
              {trend.length > 0
                ? (summary.total_responses / trend.length).toFixed(1)
                : '—'}
            </div>
            <div className="text-[10px] text-navy/30 dark:text-slate-500 mt-1">
              responses
            </div>
          </div>
        </div>
      )}

      {/* Trend Chart */}
      {trend.length > 1 && (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <div className="text-xs font-semibold text-navy/40 dark:text-slate-500 mb-3">Average Rating Over Time</div>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            {/* Y-axis grid */}
            {[1, 2, 3, 4, 5].map((tick) => {
              const y = padding.top + innerHeight - ((tick - 1) / 4) * innerHeight;
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
                    {tick}★
                  </text>
                </g>
              );
            })}

            {/* Area fill */}
            <path d={areaPath} fill="url(#satisfactionGradient)" opacity="0.2" />

            {/* Gradient definition */}
            <defs>
              <linearGradient id="satisfactionGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Line */}
            <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" />

            {/* Data points */}
            {linePoints.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={4} fill="#f59e0b" />
                <circle cx={p.x} cy={p.y} r={2.5} fill="white" />
              </g>
            ))}

            {/* X-axis labels */}
            {linePoints.filter((_, i) => i % Math.max(1, Math.floor(linePoints.length / 6)) === 0 || i === linePoints.length - 1).map((p, i) => (
              <text
                key={i}
                x={p.x}
                y={chartHeight - padding.bottom + 16}
                textAnchor="middle"
                className="text-navy/30 dark:text-slate-500 fill-current"
                fontSize="9"
              >
                {formatWeekLabel(p.data.week_start)}
              </text>
            ))}
          </svg>
        </div>
      )}

      {/* Rating Distribution */}
      {distribution.some((d) => d.count > 0) && (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4">
          <div className="text-xs font-semibold text-navy/40 dark:text-slate-500 mb-3">Rating Distribution</div>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const dist = distribution.find((d) => d.rating === star);
              const count = dist?.count ?? 0;
              const pct = (count / totalDistribution) * 100;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-xs text-navy/50 dark:text-slate-400 w-6 text-right font-medium shrink-0">
                    {star}★
                  </span>
                  <div className="flex-1 h-4 bg-cream-dark/30 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        star >= 4 ? 'bg-green-400' : star === 3 ? 'bg-yellow-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-navy/30 dark:text-slate-500 w-10 text-right shrink-0">
                    {count} ({Math.round(pct)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatWeekLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
