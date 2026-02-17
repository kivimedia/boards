'use client';

import { AIReviewResult, AIChangeVerdictResult, AIReviewVerdict } from '@/lib/types';
import Button from '@/components/ui/Button';

interface AIReviewResultsProps {
  review: AIReviewResult;
  onOverride: () => void;
  onNewReview: () => void;
  canOverride: boolean;
}

const OVERALL_VERDICT_CONFIG: Record<AIReviewVerdict, { label: string; bg: string; border: string; text: string; icon: 'check' | 'x' | 'clock' | 'shield' }> = {
  pending: {
    label: 'Pending',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-800',
    icon: 'clock',
  },
  approved: {
    label: 'Approved',
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    icon: 'check',
  },
  revisions_needed: {
    label: 'Revisions Needed',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: 'x',
  },
  overridden_approved: {
    label: 'Overridden - Approved',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: 'shield',
  },
  overridden_rejected: {
    label: 'Overridden - Rejected',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: 'shield',
  },
};

function VerdictIcon({ type, className }: { type: 'check' | 'x' | 'clock' | 'shield'; className?: string }) {
  switch (type) {
    case 'check':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'x':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'clock':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'shield':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
  }
}

function ChangeVerdictCard({ verdict }: { verdict: AIChangeVerdictResult }) {
  const config = {
    PASS: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      label: 'Pass',
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
    },
    FAIL: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      label: 'Fail',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
    },
    PARTIAL: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      label: 'Partial',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
    },
  }[verdict.verdict];

  return (
    <div className={`p-3 rounded-xl border ${config.bg} ${config.border}`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-6 h-6 rounded-full ${config.iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
          {verdict.verdict === 'PASS' ? (
            <svg className={`w-3.5 h-3.5 ${config.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : verdict.verdict === 'FAIL' ? (
            <svg className={`w-3.5 h-3.5 ${config.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className={`w-3.5 h-3.5 ${config.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold ${config.text} uppercase tracking-wider`}>
              {config.label}
            </span>
            <span className="text-xs text-navy/30 dark:text-slate-500 font-body">
              Request #{verdict.index + 1}
            </span>
          </div>

          <p className="text-sm text-navy/70 dark:text-slate-300 font-body mb-2">
            {verdict.reasoning}
          </p>

          {verdict.suggestions && (
            <div className="mt-2 p-2 rounded-lg bg-white/60 border border-white/80">
              <p className="text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-0.5">Suggestion</p>
              <p className="text-xs text-navy/60 dark:text-slate-400 font-body">{verdict.suggestions}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfidenceIndicator({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  let color = 'text-green-600 bg-green-100';
  let barColor = 'bg-green-500';
  if (percentage < 50) {
    color = 'text-red-600 bg-red-100';
    barColor = 'bg-red-500';
  } else if (percentage < 75) {
    color = 'text-yellow-600 bg-yellow-100';
    barColor = 'bg-yellow-500';
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-cream-dark dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${color}`}>
        {percentage}%
      </span>
    </div>
  );
}

export default function AIReviewResults({ review, onOverride, onNewReview, canOverride }: AIReviewResultsProps) {
  const verdictConfig = OVERALL_VERDICT_CONFIG[review.overall_verdict];
  const isOverridden = review.overall_verdict === 'overridden_approved' || review.overall_verdict === 'overridden_rejected';
  const passCount = review.verdicts.filter((v) => v.verdict === 'PASS').length;
  const failCount = review.verdicts.filter((v) => v.verdict === 'FAIL').length;
  const partialCount = review.verdicts.filter((v) => v.verdict === 'PARTIAL').length;

  return (
    <div className="space-y-4">
      {/* Overall verdict banner */}
      <div className={`p-4 rounded-xl border ${verdictConfig.bg} ${verdictConfig.border}`}>
        <div className="flex items-center gap-3">
          <VerdictIcon type={verdictConfig.icon} className={`w-8 h-8 ${verdictConfig.text}`} />
          <div className="flex-1">
            <h3 className={`text-base font-semibold font-heading ${verdictConfig.text}`}>
              {verdictConfig.label}
            </h3>
            {review.summary && (
              <p className="text-sm text-navy/60 dark:text-slate-400 font-body mt-0.5">{review.summary}</p>
            )}
          </div>
        </div>

        {/* Verdict counts */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-black/5">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {passCount} passed
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {failCount} failed
          </span>
          {partialCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              {partialCount} partial
            </span>
          )}
        </div>
      </div>

      {/* Override info */}
      {isOverridden && review.override_reason && (
        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-blue-700 mb-0.5">Override Applied</p>
              <p className="text-xs text-blue-600 font-body">{review.override_reason}</p>
              {review.overridden_at && (
                <p className="text-[11px] text-blue-500/70 font-body mt-1">
                  {new Date(review.overridden_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confidence score */}
      {review.confidence_score !== null && review.confidence_score !== undefined && (
        <div>
          <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
            Confidence
          </p>
          <ConfidenceIndicator score={review.confidence_score} />
        </div>
      )}

      {/* Individual verdicts */}
      <div>
        <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 mb-2 uppercase tracking-wider font-heading">
          Individual Verdicts ({review.verdicts.length})
        </p>
        <div className="space-y-2">
          {review.verdicts.map((v) => (
            <ChangeVerdictCard key={v.index} verdict={v} />
          ))}
          {review.verdicts.length === 0 && (
            <p className="text-sm text-navy/30 dark:text-slate-500 text-center py-4 font-body">
              No individual verdicts available.
            </p>
          )}
        </div>
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-4 pt-3 border-t border-cream-dark dark:border-slate-700 text-[11px] text-navy/30 dark:text-slate-500 font-body">
        {review.model_used && (
          <span className="inline-flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {review.model_used}
          </span>
        )}
        <span>
          {new Date(review.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button variant="secondary" size="sm" onClick={onNewReview}>
          New Review
        </Button>
        {canOverride && !isOverridden && (
          <Button variant="ghost" size="sm" onClick={onOverride}>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Override
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
