'use client';

import { AIReviewVerdict } from '@/lib/types';

interface AIReviewToggleProps {
  currentVerdict: AIReviewVerdict | null;
  onStartReview: () => void;
  isActive: boolean;
}

const VERDICT_CONFIG: Record<AIReviewVerdict, { label: string; bgClass: string; textClass: string; dotClass: string }> = {
  pending: {
    label: 'Pending Review',
    bgClass: 'bg-yellow-50 border-yellow-200',
    textClass: 'text-yellow-800',
    dotClass: 'bg-yellow-400',
  },
  approved: {
    label: 'Approved',
    bgClass: 'bg-green-50 border-green-200',
    textClass: 'text-green-800',
    dotClass: 'bg-green-500',
  },
  revisions_needed: {
    label: 'Revisions Needed',
    bgClass: 'bg-red-50 border-red-200',
    textClass: 'text-red-800',
    dotClass: 'bg-red-500',
  },
  overridden_approved: {
    label: 'Overridden (Approved)',
    bgClass: 'bg-blue-50 border-blue-200',
    textClass: 'text-blue-800',
    dotClass: 'bg-blue-500',
  },
  overridden_rejected: {
    label: 'Overridden (Rejected)',
    bgClass: 'bg-blue-50 border-blue-200',
    textClass: 'text-blue-800',
    dotClass: 'bg-blue-500',
  },
};

export default function AIReviewToggle({ currentVerdict, onStartReview, isActive }: AIReviewToggleProps) {
  const verdictInfo = currentVerdict ? VERDICT_CONFIG[currentVerdict] : null;

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700">
      <div className="flex items-center gap-3">
        {/* AI icon */}
        <div className="w-9 h-9 rounded-lg bg-electric/10 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">AI Design Review</h4>
          {verdictInfo ? (
            <span
              className={`
                inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold border
                ${verdictInfo.bgClass} ${verdictInfo.textClass}
              `}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${verdictInfo.dotClass}`} />
              {verdictInfo.label}
            </span>
          ) : (
            <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">Not reviewed yet</p>
          )}
        </div>
      </div>

      {!isActive && (
        <button
          onClick={onStartReview}
          className="
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
            bg-electric text-white hover:bg-electric-bright
            transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md
          "
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {currentVerdict ? 'New Review' : 'Start Review'}
        </button>
      )}
    </div>
  );
}
