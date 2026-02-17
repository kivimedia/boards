'use client';

interface AxeViolation {
  id: string;
  description: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  helpUrl: string;
  nodes: number;
}

interface AxeViolationListProps {
  violations: AxeViolation[];
}

const impactColors: Record<string, string> = {
  critical: 'bg-danger/20 text-danger',
  serious: 'bg-warning/20 text-warning',
  moderate: 'bg-electric/20 text-electric',
  minor: 'bg-slate-200/50 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300',
};

export default function AxeViolationList({ violations }: AxeViolationListProps) {
  if (violations.length === 0) {
    return (
      <div className="text-sm text-success flex items-center gap-2 py-2">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        No accessibility violations found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {violations.map((v) => (
        <div key={v.id} className="flex items-start gap-3 p-2 rounded-lg bg-white dark:bg-dark-bg border border-slate-100 dark:border-slate-700">
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${impactColors[v.impact] ?? impactColors.minor}`}>
            {v.impact}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-navy dark:text-white">{v.description}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{v.nodes} element{v.nodes !== 1 ? 's' : ''} affected</p>
          </div>
          {v.helpUrl && (
            <a href={v.helpUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-electric hover:underline shrink-0">
              Learn more
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
