'use client';

import { useState, useRef, useCallback } from 'react';

interface VisualDiffViewerProps {
  previousUrl: string;
  currentUrl: string;
  diffUrl: string;
  mismatchPercentage: number;
}

type ViewMode = 'side-by-side' | 'overlay' | 'slider';

export default function VisualDiffViewer({
  previousUrl,
  currentUrl,
  diffUrl,
  mismatchPercentage,
}: VisualDiffViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [sliderPos, setSliderPos] = useState(50);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const sliderRef = useRef<HTMLDivElement>(null);

  const handleSliderMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const pos = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, pos)));
  }, []);

  const mismatchColor = mismatchPercentage <= 5 ? 'text-success' : mismatchPercentage <= 15 ? 'text-warning' : 'text-danger';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-navy dark:text-white">Visual Diff</span>
          <span className={`text-sm font-bold ${mismatchColor}`}>{mismatchPercentage}% changed</span>
        </div>
        <div className="flex gap-1 bg-slate-100 dark:bg-dark-bg rounded-lg p-0.5">
          {(['side-by-side', 'overlay', 'slider'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-white dark:bg-dark-surface text-navy dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-navy dark:hover:text-white'
              }`}
            >
              {mode === 'side-by-side' ? 'Side by Side' : mode === 'overlay' ? 'Overlay' : 'Slider'}
            </button>
          ))}
        </div>
      </div>

      {/* View modes */}
      {viewMode === 'side-by-side' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Previous</p>
            <img src={previousUrl} alt="Previous version" className="w-full rounded border border-slate-200 dark:border-slate-700" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Current</p>
            <img src={currentUrl} alt="Current version" className="w-full rounded border border-slate-200 dark:border-slate-700" />
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Diff</p>
            <img src={diffUrl} alt="Visual difference" className="w-full rounded border border-slate-200 dark:border-slate-700" />
          </div>
        </div>
      )}

      {viewMode === 'overlay' && (
        <div>
          <div className="relative">
            <img src={previousUrl} alt="Previous version" className="w-full rounded border border-slate-200 dark:border-slate-700" />
            <img
              src={diffUrl}
              alt="Diff overlay"
              className="absolute inset-0 w-full h-full rounded"
              style={{ opacity: overlayOpacity }}
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Diff opacity</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">{Math.round(overlayOpacity * 100)}%</span>
          </div>
        </div>
      )}

      {viewMode === 'slider' && (
        <div
          ref={sliderRef}
          className="relative overflow-hidden rounded border border-slate-200 dark:border-slate-700 cursor-ew-resize select-none"
          onMouseMove={handleSliderMove}
        >
          <img src={currentUrl} alt="Current version" className="w-full block" />
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${sliderPos}%` }}
          >
            <img src={previousUrl} alt="Previous version" className="w-full block" style={{ minWidth: sliderRef.current?.offsetWidth }} />
          </div>
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-electric z-10"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-electric flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
