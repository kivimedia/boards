'use client';

interface ScoreBreakdown {
  growth_stage: number;
  website_quality: number;
  website_recency: number;
  connection_count: number;
  enrichment_confidence: number;
  historical_conversion: number;
  total: number;
}

interface LeadScoreGaugeProps {
  score: number;
  breakdown?: ScoreBreakdown | Record<string, number>;
  size?: 'sm' | 'md' | 'lg';
  showBreakdown?: boolean;
}

const FACTOR_LABELS: Record<string, { label: string; max: number }> = {
  growth_stage: { label: 'Growth Stage', max: 30 },
  website_quality: { label: 'Website Quality', max: 25 },
  website_recency: { label: 'Website Recency', max: 15 },
  connection_count: { label: 'Connections', max: 10 },
  enrichment_confidence: { label: 'Enrichment', max: 10 },
  historical_conversion: { label: 'History', max: 10 },
};

function getScoreColor(score: number): string {
  if (score >= 75) return 'text-green-600 dark:text-green-400';
  if (score >= 50) return 'text-amber-500 dark:text-amber-400';
  if (score >= 25) return 'text-orange-500 dark:text-orange-400';
  return 'text-red-500 dark:text-red-400';
}

function getBarColor(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 70) return 'bg-green-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-400';
}

export default function LeadScoreGauge({ score, breakdown, size = 'md', showBreakdown = false }: LeadScoreGaugeProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className={`font-bold font-heading ${sizeClasses[size]} ${getScoreColor(score)}`}>
          {score}
        </span>
        <span className="text-xs text-navy/40 dark:text-slate-500 font-body">/100</span>
      </div>

      {/* Progress bar */}
      <div className="mt-1.5 w-full h-1.5 bg-cream-dark dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : score >= 25 ? 'bg-orange-500' : 'bg-red-400'
          }`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>

      {/* Breakdown */}
      {showBreakdown && breakdown && (
        <div className="mt-3 space-y-1.5">
          {Object.entries(FACTOR_LABELS).map(([key, { label, max }]) => {
            const val = (breakdown as Record<string, number>)[key] ?? 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-navy/50 dark:text-slate-400 font-body w-20 shrink-0 truncate">
                  {label}
                </span>
                <div className="flex-1 h-1 bg-cream-dark dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${getBarColor(val, max)}`}
                    style={{ width: `${(val / max) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body w-8 text-right">
                  {val}/{max}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
