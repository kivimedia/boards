'use client';

interface BudgetCapBarProps {
  spent: number;
  cap: number;
  pct: number;
  alertLevel: 'ok' | 'warning' | 'critical';
}

export default function BudgetCapBar({ spent, cap, pct, alertLevel }: BudgetCapBarProps) {
  const barColor = alertLevel === 'critical'
    ? 'bg-red-500'
    : alertLevel === 'warning'
      ? 'bg-amber-500'
      : 'bg-electric';

  const textColor = alertLevel === 'critical'
    ? 'text-red-600 dark:text-red-400'
    : alertLevel === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-electric';

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading">
          Monthly Budget
        </h3>
        <span className={`text-xs font-bold ${textColor} font-heading`}>
          ${spent.toFixed(2)} / ${cap.toFixed(2)}
        </span>
      </div>
      <div className="w-full h-3 bg-cream dark:bg-dark-surface rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body">
          {pct.toFixed(1)}% used
        </span>
        {alertLevel === 'critical' && (
          <span className="text-[10px] font-semibold text-red-500">Budget exceeded - outreach paused</span>
        )}
        {alertLevel === 'warning' && (
          <span className="text-[10px] font-semibold text-amber-500">Nearing budget cap</span>
        )}
        {alertLevel === 'ok' && (
          <span className="text-[10px] text-navy/30 dark:text-slate-600">${(cap - spent).toFixed(2)} remaining</span>
        )}
      </div>
    </div>
  );
}
