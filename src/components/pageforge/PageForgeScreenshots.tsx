'use client';

import { useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Breakpoint = 'desktop' | 'tablet' | 'mobile';
type ViewMode = 'side-by-side' | 'overlay' | 'diff';

interface ScreenshotData {
  figma_url: string;
  wp_url: string;
  diff_url?: string;
  score: number | null;
}

interface PageForgeScreenshotsProps {
  screenshots: Record<Breakpoint, ScreenshotData>;
  buildId: string;
  onRequestFix?: (breakpoint: Breakpoint) => void;
}

const BREAKPOINT_LABELS: Record<Breakpoint, { label: string; width: string }> = {
  desktop: { label: 'Desktop', width: '1440px' },
  tablet: { label: 'Tablet', width: '768px' },
  mobile: { label: 'Mobile', width: '375px' },
};

function scoreColor(score: number | null): string {
  if (score == null) return 'text-navy/30 dark:text-slate-600';
  if (score >= 90) return 'text-success';
  if (score >= 70) return 'text-warning';
  return 'text-danger';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PageForgeScreenshots({
  screenshots,
  buildId,
  onRequestFix,
}: PageForgeScreenshotsProps) {
  const [activeBreakpoint, setActiveBreakpoint] = useState<Breakpoint>('desktop');
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  const current = screenshots[activeBreakpoint];
  const hasFigma = !!current?.figma_url;
  const hasWp = !!current?.wp_url;
  const hasDiff = !!current?.diff_url;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-navy dark:text-slate-200">
          Screenshot Comparison
        </h2>

        {/* Breakpoint tabs */}
        <div className="flex gap-1">
          {(Object.keys(BREAKPOINT_LABELS) as Breakpoint[]).map((bp) => (
            <button
              key={bp}
              onClick={() => setActiveBreakpoint(bp)}
              className={`px-2.5 py-1 text-[10px] font-semibold rounded transition-colors ${
                activeBreakpoint === bp
                  ? 'bg-electric text-white'
                  : 'bg-navy/5 dark:bg-slate-700 text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300'
              }`}
            >
              {BREAKPOINT_LABELS[bp].label} ({BREAKPOINT_LABELS[bp].width})
            </button>
          ))}
        </div>
      </div>

      {/* Score display */}
      <div className="flex items-center gap-4">
        <span className="text-xs text-navy/40 dark:text-slate-500">
          VQA Score:
        </span>
        <span className={`text-lg font-bold ${scoreColor(current?.score)}`}>
          {current?.score != null ? `${current.score}%` : 'N/A'}
        </span>
      </div>

      {/* View mode toggle */}
      <div className="flex gap-1">
        {(['side-by-side', 'overlay', 'diff'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
              viewMode === mode
                ? 'bg-navy dark:bg-slate-600 text-white'
                : 'bg-navy/5 dark:bg-slate-700 text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300'
            }`}
          >
            {mode.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Comparison area */}
      {viewMode === 'side-by-side' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2 block">
              Figma Design
            </span>
            {hasFigma ? (
              <img
                src={current.figma_url}
                alt={`Figma ${activeBreakpoint}`}
                className="w-full rounded-lg border border-navy/5 dark:border-slate-700 bg-navy/[0.02] dark:bg-slate-900"
              />
            ) : (
              <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-navy/10 dark:border-slate-700 flex items-center justify-center">
                <span className="text-xs text-navy/30 dark:text-slate-600">No screenshot</span>
              </div>
            )}
          </div>
          <div>
            <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2 block">
              WordPress Output
            </span>
            {hasWp ? (
              <img
                src={current.wp_url}
                alt={`WordPress ${activeBreakpoint}`}
                className="w-full rounded-lg border border-navy/5 dark:border-slate-700 bg-navy/[0.02] dark:bg-slate-900"
              />
            ) : (
              <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-navy/10 dark:border-slate-700 flex items-center justify-center">
                <span className="text-xs text-navy/30 dark:text-slate-600">No screenshot</span>
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'overlay' && (
        <div className="relative">
          <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2 block">
            Overlay (Figma at 50% opacity over WordPress)
          </span>
          <div className="relative rounded-lg border border-navy/5 dark:border-slate-700 overflow-hidden bg-navy/[0.02] dark:bg-slate-900">
            {hasWp && (
              <img
                src={current.wp_url}
                alt={`WordPress ${activeBreakpoint}`}
                className="w-full"
              />
            )}
            {hasFigma && (
              <img
                src={current.figma_url}
                alt={`Figma ${activeBreakpoint} overlay`}
                className="absolute inset-0 w-full h-full object-cover opacity-50"
              />
            )}
            {!hasFigma && !hasWp && (
              <div className="w-full aspect-[4/3] flex items-center justify-center">
                <span className="text-xs text-navy/30 dark:text-slate-600">No screenshots available</span>
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'diff' && (
        <div>
          <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2 block">
            Visual Diff
          </span>
          {hasDiff ? (
            <img
              src={current.diff_url}
              alt={`Diff ${activeBreakpoint}`}
              className="w-full rounded-lg border border-navy/5 dark:border-slate-700 bg-navy/[0.02] dark:bg-slate-900"
            />
          ) : (
            <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-navy/10 dark:border-slate-700 flex items-center justify-center">
              <span className="text-xs text-navy/30 dark:text-slate-600">
                Diff not generated yet
              </span>
            </div>
          )}
        </div>
      )}

      {/* Request Fix button */}
      {onRequestFix && (
        <div className="flex items-center justify-end pt-2">
          <button
            onClick={() => onRequestFix(activeBreakpoint)}
            className="px-4 py-2 text-xs font-semibold text-white bg-warning hover:bg-yellow-600 rounded-lg transition-colors"
          >
            Request Fix ({BREAKPOINT_LABELS[activeBreakpoint].label})
          </button>
        </div>
      )}
    </div>
  );
}
