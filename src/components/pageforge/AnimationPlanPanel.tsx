'use client';

import { useState } from 'react';

interface AnimationItem {
  target: string;
  trigger: 'scroll' | 'hover' | 'load' | string;
  type: string;
  duration: string;
  delay: string;
  easing: string;
  description: string;
}

interface AnimationPlanPanelProps {
  animationPlan: AnimationItem[];
  animationsApplied: number;
  totalPlanned: number;
  hasAnimationPlan: boolean;
}

const TRIGGER_COLORS: Record<string, string> = {
  scroll: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  hover: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  load: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const TYPE_ICONS: Record<string, string> = {
  fadeIn: 'opacity-60',
  slideUp: 'translate-y-1',
  slideDown: '-translate-y-1',
  slideLeft: 'translate-x-1',
  slideRight: '-translate-x-1',
  scale: 'scale-95',
  parallax: 'rotate-3',
};

export default function AnimationPlanPanel({
  animationPlan,
  animationsApplied,
  totalPlanned,
  hasAnimationPlan,
}: AnimationPlanPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!hasAnimationPlan || animationPlan.length === 0) return null;

  const appliedPct = totalPlanned > 0 ? Math.round((animationsApplied / totalPlanned) * 100) : 0;

  return (
    <div className="rounded-xl border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-navy/5 dark:bg-slate-700/50 border-b border-navy/10 dark:border-slate-700 hover:bg-navy/10 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {expanded ? '\u25BC' : '\u25B6'}
          </span>
          <h3 className="text-sm font-semibold text-navy dark:text-slate-200">
            Animation Plan
          </h3>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 font-medium">
            {animationPlan.length} animations
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-20 h-1.5 rounded-full bg-navy/10 dark:bg-slate-600 overflow-hidden">
            <div
              className="h-full rounded-full bg-purple-500 transition-all"
              style={{ width: `${appliedPct}%` }}
            />
          </div>
          <span className="text-[11px] text-navy/50 dark:text-slate-400">
            {animationsApplied}/{totalPlanned} applied
          </span>
        </div>
      </button>

      {/* Animation list */}
      {expanded && (
        <div className="divide-y divide-navy/5 dark:divide-slate-700">
          {animationPlan.map((anim, i) => (
            <div key={i} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-navy dark:text-slate-200">
                      {anim.target}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TRIGGER_COLORS[anim.trigger] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {anim.trigger}
                    </span>
                    <span className="text-[10px] font-mono text-navy/50 dark:text-slate-400 bg-navy/5 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                      {anim.type}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-navy/50 dark:text-slate-400">
                    {anim.description}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-navy/40 dark:text-slate-500">
                    <span>Duration: {anim.duration}</span>
                    {anim.delay && anim.delay !== '0s' && <span>Delay: {anim.delay}</span>}
                    <span>Easing: {anim.easing}</span>
                  </div>
                </div>
                {i < animationsApplied && (
                  <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Applied
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
