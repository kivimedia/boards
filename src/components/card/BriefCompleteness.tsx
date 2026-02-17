'use client';

interface BriefCompletenessProps {
  score: number;
  isComplete: boolean;
  missingRequired: string[];
}

export default function BriefCompleteness({ score, isComplete, missingRequired }: BriefCompletenessProps) {
  const getBarColor = () => {
    if (isComplete) return 'bg-green-500';
    if (score < 30) return 'bg-red-500';
    return 'bg-electric';
  };

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-cream-dark dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getBarColor()}`}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-navy/60 dark:text-slate-400 font-body whitespace-nowrap">
          {isComplete ? 'Brief Complete' : `Brief: ${score}% complete`}
        </span>
      </div>

      {/* Missing required fields */}
      {!isComplete && missingRequired.length > 0 && (
        <p className="text-xs text-red-500 font-body">
          Missing required: {missingRequired.join(', ')}
        </p>
      )}
    </div>
  );
}
