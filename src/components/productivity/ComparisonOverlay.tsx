'use client';

import type { ProductivityMetrics } from '@/lib/types';

interface ComparisonOverlayProps {
  current: ProductivityMetrics;
  previous?: ProductivityMetrics;
  show: boolean;
}

function DeltaIndicator({ current, previous, isHigherBetter = true }: {
  current: number;
  previous: number;
  isHigherBetter?: boolean;
}) {
  if (previous === 0) return null;

  const delta = current - previous;
  const pctChange = previous > 0 ? ((delta / previous) * 100) : 0;
  const isPositive = isHigherBetter ? delta > 0 : delta < 0;
  const isNeutral = Math.abs(pctChange) < 1;

  if (isNeutral) {
    return (
      <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
        ~0%
      </span>
    );
  }

  return (
    <span className={`text-xs ml-1 font-medium ${
      isPositive
        ? 'text-green-600 dark:text-green-400'
        : 'text-red-600 dark:text-red-400'
    }`}>
      {delta > 0 ? '↑' : '↓'} {Math.abs(pctChange).toFixed(1)}%
    </span>
  );
}

export default function ComparisonOverlay({ current, previous, show }: ComparisonOverlayProps) {
  if (!show || !previous) return null;

  const metrics = [
    { label: 'Tickets Completed', current: current.ticketsCompleted, previous: previous.ticketsCompleted, higher: true },
    { label: 'Avg Cycle Time', current: current.avgCycleTimeHours, previous: previous.avgCycleTimeHours, higher: false },
    { label: 'On-time Rate', current: current.onTimeRate, previous: previous.onTimeRate, higher: true },
    { label: 'Revision Rate', current: current.revisionRate, previous: previous.revisionRate, higher: false },
    { label: 'AI Pass Rate', current: current.aiPassRate, previous: previous.aiPassRate, higher: true },
  ];

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
        Period Comparison
      </h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((m) => (
          <div key={m.label} className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{m.label}</div>
            <div className="flex items-center justify-center gap-1">
              <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {typeof m.current === 'number' && m.label.includes('Rate')
                  ? `${m.current.toFixed(1)}%`
                  : typeof m.current === 'number' && m.label.includes('Cycle')
                  ? `${m.current.toFixed(1)}h`
                  : m.current}
              </span>
              <DeltaIndicator
                current={m.current}
                previous={m.previous}
                isHigherBetter={m.higher}
              />
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              prev: {typeof m.previous === 'number' && m.label.includes('Rate')
                ? `${m.previous.toFixed(1)}%`
                : typeof m.previous === 'number' && m.label.includes('Cycle')
                ? `${m.previous.toFixed(1)}h`
                : m.previous}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
