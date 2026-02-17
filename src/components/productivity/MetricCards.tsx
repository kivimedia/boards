'use client';

import type { ProductivityMetrics } from '@/lib/types';

interface MetricCardsProps {
  metrics: ProductivityMetrics;
  previousMetrics?: ProductivityMetrics | null;
  loading?: boolean;
}

interface MetricCardData {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend: number | null;
  suffix?: string;
  color: string;
}

function TrendIndicator({ trend }: { trend: number | null }) {
  if (trend === null || trend === 0) return null;

  const isPositive = trend > 0;
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold font-body ${
        isPositive ? 'text-emerald-600' : 'text-red-500'
      }`}
    >
      <svg
        className={`w-3 h-3 mr-0.5 ${isPositive ? '' : 'rotate-180'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
      {Math.abs(trend).toFixed(1)}%
    </span>
  );
}

function calculateTrend(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export default function MetricCards({ metrics, previousMetrics, loading }: MetricCardsProps) {
  const cards: MetricCardData[] = [
    {
      label: 'Tickets Completed',
      value: metrics.ticketsCompleted.toString(),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      trend: calculateTrend(metrics.ticketsCompleted, previousMetrics?.ticketsCompleted),
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Tickets Created',
      value: metrics.ticketsCreated.toString(),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      ),
      trend: calculateTrend(metrics.ticketsCreated, previousMetrics?.ticketsCreated),
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Avg Cycle Time',
      value: metrics.avgCycleTimeHours.toFixed(1),
      suffix: 'hrs',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      trend: previousMetrics
        ? calculateTrend(metrics.avgCycleTimeHours, previousMetrics.avgCycleTimeHours)
        : null,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'On-Time Rate',
      value: metrics.onTimeRate.toFixed(1),
      suffix: '%',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      trend: calculateTrend(metrics.onTimeRate, previousMetrics?.onTimeRate),
      color: 'text-electric bg-electric/10',
    },
    {
      label: 'Revision Rate',
      value: metrics.revisionRate.toFixed(1),
      suffix: '%',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      trend: previousMetrics
        ? calculateTrend(metrics.revisionRate, previousMetrics.revisionRate)
        : null,
      color: 'text-orange-600 bg-orange-50',
    },
    {
      label: 'AI Pass Rate',
      value: metrics.aiPassRate.toFixed(1),
      suffix: '%',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      trend: calculateTrend(metrics.aiPassRate, previousMetrics?.aiPassRate),
      color: 'text-violet-600 bg-violet-50',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm animate-pulse"
          >
            <div className="h-4 w-24 bg-cream-dark dark:bg-slate-700 rounded mb-3" />
            <div className="h-8 w-16 bg-cream-dark dark:bg-slate-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm hover:shadow-md transition-shadow duration-200"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
              {card.label}
            </p>
            <div className={`p-2 rounded-xl ${card.color}`}>
              {card.icon}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">
              {card.value}
              {card.suffix && (
                <span className="text-sm font-medium text-navy/40 dark:text-slate-500 ml-1">{card.suffix}</span>
              )}
            </p>
            <TrendIndicator trend={card.trend} />
          </div>
        </div>
      ))}
    </div>
  );
}
