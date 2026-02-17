'use client';

import type { UserScorecard } from '@/lib/types';

interface UserLeaderboardProps {
  scorecards: UserScorecard[];
  loading?: boolean;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-white text-xs font-bold shadow-sm">
        #1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-300 text-white text-xs font-bold shadow-sm">
        #2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700 text-white text-xs font-bold shadow-sm">
        #3
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-cream-dark dark:bg-slate-700 dark:bg-slate-700 text-navy/50 dark:text-slate-400 text-xs font-semibold">
      #{rank}
    </span>
  );
}

function Sparkline({ data }: { data: { date: string; completed: number }[] }) {
  if (data.length < 2) return null;

  const max = Math.max(...data.map((d) => d.completed), 1);
  const width = 80;
  const height = 24;
  const padding = 2;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - (d.completed / max) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#6366f1"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {data.length > 0 && (
        <circle
          cx={padding + ((data.length - 1) / (data.length - 1)) * (width - padding * 2)}
          cy={
            height -
            padding -
            (data[data.length - 1].completed / max) * (height - padding * 2)
          }
          r="2"
          fill="#6366f1"
        />
      )}
    </svg>
  );
}

export default function UserLeaderboard({ scorecards, loading }: UserLeaderboardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Team Leaderboard</h3>
        </div>
        <div className="p-5 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="w-7 h-7 rounded-full bg-cream-dark dark:bg-slate-700" />
              <div className="h-4 w-24 bg-cream-dark dark:bg-slate-700 rounded" />
              <div className="flex-1" />
              <div className="h-4 w-12 bg-cream-dark dark:bg-slate-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (scorecards.length === 0) {
    return (
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Team Leaderboard</h3>
        </div>
        <div className="p-8 text-center text-navy/40 dark:text-slate-500 text-sm font-body">
          No user data available for this period
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Team Leaderboard</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="border-b border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30">
              <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400 w-12">Rank</th>
              <th className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Name</th>
              <th className="text-right px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Completed</th>
              <th className="text-right px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Created</th>
              <th className="text-right px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Cycle Time</th>
              <th className="text-right px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">On-Time</th>
              <th className="text-right px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Revision</th>
              <th className="text-right px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">AI Pass</th>
              <th className="text-center px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400">Trend</th>
            </tr>
          </thead>
          <tbody>
            {scorecards.map((sc) => (
              <tr
                key={sc.userId}
                className="border-b border-cream-dark/50 dark:border-slate-700/50 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <RankBadge rank={sc.rank} />
                </td>
                <td className="px-4 py-3 text-navy dark:text-slate-100 font-medium">
                  {sc.userName}
                </td>
                <td className="px-4 py-3 text-right text-navy dark:text-slate-100 font-semibold">
                  {sc.metrics.ticketsCompleted}
                </td>
                <td className="px-4 py-3 text-right text-navy/70 dark:text-slate-300">
                  {sc.metrics.ticketsCreated}
                </td>
                <td className="px-4 py-3 text-right text-navy/70 dark:text-slate-300">
                  {sc.metrics.avgCycleTimeHours.toFixed(1)}h
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`font-medium ${
                      sc.metrics.onTimeRate >= 80
                        ? 'text-emerald-600'
                        : sc.metrics.onTimeRate >= 60
                        ? 'text-amber-600'
                        : 'text-red-500'
                    }`}
                  >
                    {sc.metrics.onTimeRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-navy/70 dark:text-slate-300">
                  {sc.metrics.revisionRate.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right text-navy/70 dark:text-slate-300">
                  {sc.metrics.aiPassRate.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-center">
                  <Sparkline data={sc.trend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
