'use client';

interface LighthouseScoreGaugeProps {
  label: string;
  score: number;
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-success';
  if (score >= 50) return 'text-warning';
  return 'text-danger';
}

function scoreBgColor(score: number): string {
  if (score >= 90) return 'bg-success/20';
  if (score >= 50) return 'bg-warning/20';
  return 'bg-danger/20';
}

export default function LighthouseScoreGauge({ label, score }: LighthouseScoreGaugeProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-14 h-14 rounded-full ${scoreBgColor(score)} flex items-center justify-center`}>
        <span className={`text-lg font-bold ${scoreColor(score)}`}>{score}</span>
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}
