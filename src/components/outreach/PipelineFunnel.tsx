'use client';

import { LI_PIPELINE_STAGES, type LIPipelineStage } from '@/lib/types';

interface PipelineFunnelProps {
  stageCounts: Record<string, number>;
  onStageClick?: (stage: LIPipelineStage) => void;
}

// Group stages into funnel sections
const FUNNEL_SECTIONS = [
  {
    label: 'Scout',
    stages: ['TO_ENRICH', 'ENRICHING', 'TO_QUALIFY', 'QUALIFYING'] as LIPipelineStage[],
    sectionColor: 'bg-blue-500',
  },
  {
    label: 'Outreach',
    stages: ['TO_SEND_CONNECTION', 'CONNECTION_SENT'] as LIPipelineStage[],
    sectionColor: 'bg-amber-500',
  },
  {
    label: 'Engaged',
    stages: ['CONNECTED', 'MESSAGE_SENT', 'NUDGE_SENT', 'LOOM_PERMISSION', 'LOOM_SENT'] as LIPipelineStage[],
    sectionColor: 'bg-cyan-500',
  },
  {
    label: 'Won',
    stages: ['REPLIED', 'BOOKED'] as LIPipelineStage[],
    sectionColor: 'bg-green-500',
  },
  {
    label: 'Lost',
    stages: ['NOT_INTERESTED', 'COLD_CONNECTION', 'FROZEN', 'PERMANENTLY_COLD'] as LIPipelineStage[],
    sectionColor: 'bg-gray-400',
  },
];

export default function PipelineFunnel({ stageCounts, onStageClick }: PipelineFunnelProps) {
  const totalLeads = Object.values(stageCounts).reduce((sum, c) => sum + c, 0);

  return (
    <div className="space-y-4">
      {/* Section overview */}
      <div className="grid grid-cols-5 gap-2">
        {FUNNEL_SECTIONS.map((section) => {
          const count = section.stages.reduce((sum, s) => sum + (stageCounts[s] || 0), 0);
          return (
            <div key={section.label} className="text-center">
              <div className={`h-1 rounded-full ${section.sectionColor} mb-1.5`} />
              <p className="text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading">
                {section.label}
              </p>
              <p className="text-lg font-bold text-navy dark:text-white font-heading">
                {count}
              </p>
            </div>
          );
        })}
      </div>

      {/* Detailed stage bars */}
      <div className="space-y-1">
        {FUNNEL_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="text-[10px] font-semibold text-navy/30 dark:text-slate-600 uppercase tracking-wider mt-2 mb-1 font-heading">
              {section.label}
            </p>
            {section.stages.map((stage) => {
              const config = LI_PIPELINE_STAGES[stage];
              const count = stageCounts[stage] || 0;
              const pct = totalLeads > 0 ? (count / totalLeads) * 100 : 0;

              return (
                <button
                  key={stage}
                  onClick={() => onStageClick?.(stage)}
                  className="w-full flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-cream dark:hover:bg-slate-800 transition-colors group text-left"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-xs text-navy/60 dark:text-slate-400 font-body w-36 truncate group-hover:text-navy dark:group-hover:text-white transition-colors">
                    {config.label}
                  </span>
                  <div className="flex-1 h-1.5 bg-cream-dark dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%`, backgroundColor: config.color }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-navy dark:text-white font-heading w-8 text-right">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
