'use client';

import type { PGAQualityTier } from '@/lib/types';

interface QualityScoreBarProps {
  score: number;
  tier: PGAQualityTier;
  breakdown?: {
    revenue_magnitude: number;
    proof_strength: number;
    reachability: number;
    vibe_coding_fit: number;
    content_richness: number;
    reasons?: string[];
  };
  showBreakdown?: boolean;
}

const DIMENSION_LABELS: Record<string, string> = {
  revenue_magnitude: 'Revenue',
  proof_strength: 'Proof',
  reachability: 'Reachable',
  vibe_coding_fit: 'Fit',
  content_richness: 'Content',
};

function getScoreColor(score: number): string {
  if (score >= 7) return 'bg-red-500';
  if (score >= 4) return 'bg-orange-500';
  return 'bg-blue-500';
}

function getDimensionColor(value: number): string {
  if (value >= 2) return 'bg-green-500';
  if (value >= 1) return 'bg-yellow-500';
  return 'bg-red-400';
}

export default function QualityScoreBar({ score, tier, breakdown, showBreakdown }: QualityScoreBarProps) {
  return (
    <div className="space-y-2">
      {/* Total score bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-navy/60 dark:text-slate-400 w-14 shrink-0">
          Score
        </span>
        <div className="flex-1 h-2 bg-navy/5 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getScoreColor(score)}`}
            style={{ width: `${Math.min(score * 10, 100)}%` }}
          />
        </div>
        <span className="text-sm font-bold text-navy dark:text-slate-100 w-10 text-right">
          {score}/10
        </span>
      </div>

      {/* Breakdown */}
      {showBreakdown && breakdown && (
        <div className="space-y-1.5 pl-1">
          {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
            const value = (breakdown as unknown as Record<string, number>)[key] ?? 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] text-navy/40 dark:text-slate-500 w-14 shrink-0 truncate">
                  {label}
                </span>
                <div className="flex gap-0.5">
                  {[0, 1].map((i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-sm ${
                        i < value
                          ? getDimensionColor(value)
                          : 'bg-navy/5 dark:bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-navy/40 dark:text-slate-500">
                  {value}/2
                </span>
              </div>
            );
          })}

          {/* Reasons */}
          {breakdown.reasons && breakdown.reasons.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {breakdown.reasons.slice(0, 5).map((reason, idx) => (
                <p key={idx} className="text-[10px] text-navy/40 dark:text-slate-500 leading-tight">
                  {reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
