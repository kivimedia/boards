'use client';

import type { ThroughputData } from '@/lib/types';

interface TeamThroughputProps {
  throughput: ThroughputData;
}

function DeltaArrow({ value, invertGood }: { value: number; invertGood?: boolean }) {
  if (value === 0) return <span className="text-[10px] text-navy/30 dark:text-slate-500 font-body">-</span>;

  // For cycle time, lower is better (invertGood)
  const isPositive = invertGood ? value < 0 : value > 0;
  const absVal = Math.abs(value);

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-bold font-body ${
        isPositive
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-red-500 dark:text-red-400'
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={value < 0 ? 'rotate-180' : ''}
      >
        <path d="M12 4l-8 8h5v8h6v-8h5z" />
      </svg>
      {absVal}%
    </span>
  );
}

export default function TeamThroughput({ throughput }: TeamThroughputProps) {
  const metrics = [
    {
      label: 'Tickets Completed',
      value: throughput.thisWeek.ticketsCompleted,
      prevValue: throughput.lastWeek.ticketsCompleted,
      delta: throughput.completedDelta,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
      iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Tickets Created',
      value: throughput.thisWeek.ticketsCreated,
      prevValue: throughput.lastWeek.ticketsCreated,
      delta: throughput.lastWeek.ticketsCreated > 0
        ? Math.round(((throughput.thisWeek.ticketsCreated - throughput.lastWeek.ticketsCreated) / throughput.lastWeek.ticketsCreated) * 100)
        : 0,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      ),
      iconBg: 'bg-blue-50 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Avg Cycle Time',
      value: throughput.thisWeek.avgCycleTimeHours,
      prevValue: throughput.lastWeek.avgCycleTimeHours,
      delta: throughput.cycleDelta,
      invertGood: true,
      suffix: 'hrs',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      iconBg: 'bg-amber-50 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
  ];

  const hasData = throughput.thisWeek.ticketsCompleted > 0 || throughput.lastWeek.ticketsCompleted > 0;

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600 dark:text-violet-400">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
          Team Throughput
        </h3>
        <span className="text-[10px] text-navy/30 dark:text-slate-500 font-body">
          this week vs last
        </span>
      </div>

      {!hasData ? (
        <p className="text-xs text-navy/40 dark:text-slate-500 font-body text-center py-4">
          Throughput data will appear after the first nightly snapshot.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-cream-dark dark:border-slate-700 p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${metric.iconBg}`}>
                  <span className={metric.iconColor}>{metric.icon}</span>
                </div>
                <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                  {metric.label}
                </span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-xl font-bold text-navy dark:text-slate-100 font-heading">
                  {metric.suffix
                    ? metric.value.toFixed(1)
                    : metric.value}
                </span>
                {metric.suffix && (
                  <span className="text-xs text-navy/30 dark:text-slate-500 font-body mb-0.5">
                    {metric.suffix}
                  </span>
                )}
                <DeltaArrow value={metric.delta} invertGood={metric.invertGood} />
              </div>
              <p className="text-[10px] text-navy/30 dark:text-slate-500 font-body mt-1">
                Last week: {metric.suffix ? metric.prevValue.toFixed(1) : metric.prevValue}
                {metric.suffix ? ` ${metric.suffix}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
