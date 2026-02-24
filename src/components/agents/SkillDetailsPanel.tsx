'use client';

import type { AgentSkill, AgentQualityTier } from '@/lib/types';

const TIER_CONFIG: Record<AgentQualityTier, { label: string; color: string; bg: string }> = {
  genuinely_smart: { label: 'Smart', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  solid: { label: 'Solid', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  has_potential: { label: 'Potential', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  placeholder: { label: 'Placeholder', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
  tool_dependent: { label: 'Tool Dep.', color: 'text-gray-700 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' },
};

interface SkillDetailsPanelProps {
  skill: AgentSkill | null;
}

export default function SkillDetailsPanel({ skill }: SkillDetailsPanelProps) {
  if (!skill) {
    return (
      <div className="sticky top-4 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-navy/10 dark:border-slate-700 p-8 text-center">
        <div className="text-4xl mb-3">🤖</div>
        <p className="text-sm text-navy/50 dark:text-slate-400 font-body">
          Select a skill to see details and launch an agent task.
        </p>
      </div>
    );
  }

  const tier = TIER_CONFIG[skill.quality_tier];

  return (
    <div className="sticky top-4 bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{skill.icon}</span>
        <div>
          <h3 className="font-heading font-semibold text-navy dark:text-slate-100">{skill.name}</h3>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tier.bg} ${tier.color}`}>
            {tier.label}
          </span>
        </div>
      </div>

      <p className="text-sm text-navy/60 dark:text-slate-400 mb-4">{skill.description}</p>

      {/* Quality score */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-navy/40 dark:text-slate-500 mb-1">
          <span>Quality Score</span>
          <span className="font-mono">{skill.quality_score}/100</span>
        </div>
        <div className="h-2 bg-cream dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              skill.quality_score >= 85 ? 'bg-emerald-500'
                : skill.quality_score >= 70 ? 'bg-blue-500'
                : skill.quality_score >= 55 ? 'bg-amber-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${skill.quality_score}%` }}
          />
        </div>
      </div>

      {/* Strengths */}
      {skill.strengths.length > 0 && (
        <div className="mb-3">
          <h4 className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Strengths</h4>
          <ul className="space-y-0.5">
            {skill.strengths.slice(0, 3).map((s, i) => (
              <li key={i} className="text-xs text-navy/60 dark:text-slate-400 flex gap-1.5">
                <span className="text-emerald-500 shrink-0">+</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {skill.weaknesses.length > 0 && (
        <div className="mb-3">
          <h4 className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Weaknesses</h4>
          <ul className="space-y-0.5">
            {skill.weaknesses.slice(0, 3).map((w, i) => (
              <li key={i} className="text-xs text-navy/60 dark:text-slate-400 flex gap-1.5">
                <span className="text-red-500 shrink-0">-</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Required context */}
      {skill.required_context.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1">Required Context</h4>
          <div className="flex flex-wrap gap-1">
            {skill.required_context.map((ctx) => (
              <span key={ctx} className="text-[10px] px-1.5 py-0.5 rounded bg-cream dark:bg-slate-700 text-navy/50 dark:text-slate-400">
                {ctx}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
