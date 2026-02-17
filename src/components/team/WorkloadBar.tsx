'use client';

interface WorkloadBarProps {
  total: number;
  overdue: number;
  dueSoon: number;
  max?: number;
}

export default function WorkloadBar({ total, overdue, dueSoon, max = 20 }: WorkloadBarProps) {
  const totalPct = Math.min((total / max) * 100, 100);
  const overduePct = total > 0 ? (overdue / total) * totalPct : 0;
  const dueSoonPct = total > 0 ? (dueSoon / total) * totalPct : 0;

  return (
    <div>
      <div className="h-3 w-full bg-cream-dark dark:bg-white/5 rounded-full overflow-hidden relative">
        {/* Total bar background */}
        <div
          className="absolute inset-y-0 left-0 bg-electric/20 rounded-full transition-all duration-500"
          style={{ width: `${totalPct}%` }}
        />
        {/* Overdue segment */}
        {overdue > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-danger rounded-l-full transition-all duration-500"
            style={{ width: `${overduePct}%` }}
          />
        )}
        {/* Due soon segment */}
        {dueSoon > 0 && (
          <div
            className="absolute inset-y-0 bg-warning transition-all duration-500"
            style={{ left: `${overduePct}%`, width: `${dueSoonPct}%` }}
          />
        )}
      </div>
      <p className="text-[11px] text-navy/50 dark:text-white/50 mt-1.5">
        {total} cards{overdue > 0 ? ` (${overdue} overdue)` : ''}
      </p>
    </div>
  );
}
