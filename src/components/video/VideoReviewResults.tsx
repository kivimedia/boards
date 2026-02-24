'use client';

interface VideoReviewResultsProps {
  verdicts: { index: number; verdict: string; reasoning: string }[];
  overallVerdict: string;
  summary: string;
  confidenceScore: number;
  modelUsed: string;
  frames: { timestamp: number; storagePath: string }[];
  storageBaseUrl: string;
}

const verdictColors: Record<string, string> = {
  PASS: 'bg-success/20 text-success',
  FAIL: 'bg-danger/20 text-danger',
  PARTIAL: 'bg-warning/20 text-warning',
};

export default function VideoReviewResults({
  verdicts,
  overallVerdict,
  summary,
  confidenceScore,
  frames,
  storageBaseUrl,
}: VideoReviewResultsProps) {
  return (
    <div className="space-y-4">
      {/* Overall verdict */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-white dark:bg-dark-bg border border-slate-200 dark:border-slate-700">
        <div>
          <span className="text-sm font-medium text-navy dark:text-white">Video Review Result</span>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{summary}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-1 rounded text-xs font-bold ${
            overallVerdict === 'approved' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
          }`}>
            {overallVerdict === 'approved' ? 'Approved' : 'Revisions Needed'}
          </span>
          <span className="text-xs text-slate-400">{confidenceScore}% confidence</span>
        </div>
      </div>

      {/* Extracted frames */}
      {frames.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Analyzed Frames</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {frames.map((f) => (
              <div key={f.timestamp} className="shrink-0">
                <img
                  src={`${storageBaseUrl}/${f.storagePath}`}
                  alt={`Frame at ${f.timestamp}s`}
                  className="w-32 h-20 object-cover rounded border border-slate-200 dark:border-slate-700"
                />
                <p className="text-xs text-slate-400 text-center mt-0.5">{f.timestamp}s</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Individual verdicts */}
      <div className="space-y-2">
        {verdicts.map((v) => (
          <div key={v.index} className="flex items-start gap-3 p-2 rounded-lg bg-white dark:bg-dark-bg border border-slate-100 dark:border-slate-700">
            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${verdictColors[v.verdict] ?? 'bg-slate-200 text-slate-600'}`}>
              {v.verdict}
            </span>
            <div>
              <p className="text-sm text-navy dark:text-white">{v.reasoning}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
