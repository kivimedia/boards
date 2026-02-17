'use client';

import type { AiAssistantResponse, AiUserMood, AiBoardCategory, BoardChartData } from '@/lib/types';
import BoardChartRenderer from './BoardChartRenderer';

interface AiBotResponseProps {
  response: string;
  loading: boolean;
  streaming: boolean;
  query: string;
  meta: Omit<AiAssistantResponse, 'response' | 'thinking'> | null;
  chartData?: BoardChartData | null;
  onSuggestedQuestion?: (question: string) => void;
  onConnectOwner?: () => void;
}

const MOOD_INDICATORS: Record<AiUserMood, { emoji: string; color: string }> = {
  positive: { emoji: '\u{1F7E2}', color: 'text-green-500' },
  neutral: { emoji: '\u{1F535}', color: 'text-blue-400' },
  negative: { emoji: '\u{1F7E0}', color: 'text-orange-400' },
  curious: { emoji: '\u{1F7E3}', color: 'text-purple-400' },
  frustrated: { emoji: '\u{1F534}', color: 'text-red-400' },
  confused: { emoji: '\u{1F7E1}', color: 'text-yellow-400' },
};

const CATEGORY_LABELS: Record<AiBoardCategory, string> = {
  workload: 'Workload',
  deadlines: 'Deadlines',
  assignments: 'Assignments',
  progress: 'Progress',
  blocked: 'Blocked',
  general: 'General',
};

export default function AiBotResponse({
  response,
  loading,
  streaming,
  query,
  meta,
  chartData,
  onSuggestedQuestion,
  onConnectOwner,
}: AiBotResponseProps) {
  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-electric/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-electric animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs text-navy/40 dark:text-slate-500 font-body mb-2">Thinking about: &quot;{query}&quot;</p>
            <div className="space-y-2">
              <div className="h-3 bg-cream-dark dark:bg-slate-800 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-cream-dark dark:bg-slate-800 rounded animate-pulse w-1/2" />
              <div className="h-3 bg-cream-dark dark:bg-slate-800 rounded animate-pulse w-5/6" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!response) return null;

  const mood = meta?.user_mood || 'neutral';
  const moodInfo = MOOD_INDICATORS[mood];
  const categories = meta?.matched_categories || [];
  const suggestions = meta?.suggested_questions || [];
  const redirect = meta?.redirect_to_owner;

  return (
    <div className="px-4 py-4 max-h-[400px] overflow-y-auto">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-electric/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          {/* Mood indicator */}
          {meta && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`text-[10px] ${moodInfo.color}`}>{moodInfo.emoji}</span>
              <span className="text-[10px] text-navy/30 dark:text-slate-500 font-body capitalize">{mood}</span>
            </div>
          )}

          {/* Response text */}
          <div className="text-sm text-navy dark:text-slate-200 font-body whitespace-pre-wrap leading-relaxed">
            {response}
            {streaming && <span className="inline-block w-1.5 h-4 bg-electric/60 ml-0.5 animate-pulse rounded-sm" />}
          </div>

          {/* Inline chart (hidden during streaming) */}
          {chartData && !streaming && (
            <BoardChartRenderer chartData={chartData} />
          )}

          {/* Category tags */}
          {categories.length > 0 && !streaming && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {categories.map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-body bg-cream-dark dark:bg-slate-800 text-navy/50 dark:text-slate-400"
                >
                  {CATEGORY_LABELS[cat as AiBoardCategory] || cat}
                </span>
              ))}
            </div>
          )}

          {/* Redirect to owner */}
          {redirect?.should_redirect && !streaming && (
            <div className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-body mb-2">
                {redirect.reason || 'This question may require input from the board owner.'}
              </p>
              {onConnectOwner && (
                <button
                  onClick={onConnectOwner}
                  className="text-xs font-body font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Connect with board owner
                </button>
              )}
            </div>
          )}

          {/* Suggested follow-up questions */}
          {suggestions.length > 0 && !streaming && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] text-navy/30 dark:text-slate-500 font-body uppercase tracking-wide">Follow-up questions</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onSuggestedQuestion?.(q)}
                    className="text-xs font-body text-electric dark:text-electric/90 bg-electric/5 dark:bg-electric/10 hover:bg-electric/10 dark:hover:bg-electric/20 border border-electric/20 dark:border-electric/30 px-2.5 py-1 rounded-full transition-colors text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
