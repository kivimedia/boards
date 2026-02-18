'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useProfilingStore, BoardProfilingData, CardProfilingData, PageProfilingData, ProfilingPhase } from '@/stores/profiling-store';

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function PhaseTable({ phases, totalMs }: { phases: ProfilingPhase[]; totalMs: number }) {
  const maxMs = Math.max(...phases.map(p => p.ms), 1);

  return (
    <div className="space-y-0.5">
      {phases.map((phase, i) => {
        const pct = totalMs > 0 ? (phase.ms / totalMs) * 100 : 0;
        const barWidth = (phase.ms / maxMs) * 100;
        return (
          <div key={i} className="flex items-center gap-2 text-[11px] font-body">
            <span className="w-24 truncate text-navy/60 dark:text-slate-400 shrink-0">{phase.name}</span>
            <span className="w-14 text-right font-mono text-navy/80 dark:text-slate-300 shrink-0">{formatMs(phase.ms)}</span>
            <span className="w-10 text-right text-navy/40 dark:text-slate-500 shrink-0">{pct.toFixed(0)}%</span>
            <div className="flex-1 h-2 bg-cream-dark/50 dark:bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct > 30 ? 'bg-danger/70' : pct > 15 ? 'bg-amber-400/70' : 'bg-electric/50'
                }`}
                style={{ width: `${Math.max(barWidth, 2)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardPanel({ data, onDismiss }: { data: BoardProfilingData; onDismiss: () => void }) {
  return (
    <div className="w-80 bg-white dark:bg-dark-surface rounded-xl shadow-modal dark:shadow-none border border-cream-dark dark:border-slate-700 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-electric">Board Profile</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cream dark:bg-navy text-navy/40 dark:text-slate-500 font-medium">{data.source.toUpperCase()}</span>
        </div>
        <button
          onClick={onDismiss}
          className="p-0.5 rounded text-navy/30 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Summary */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">{formatMs(data.totalMs)}</span>
        <span className="text-[10px] text-navy/40 dark:text-slate-500">{data.cardCount} cards</span>
        <span className="text-[10px] text-navy/30 dark:text-slate-600">{data.boardName}</span>
      </div>

      {/* Phase breakdown */}
      <PhaseTable phases={data.phases} totalMs={data.totalMs} />

      {/* Footer stats */}
      {data.coverCount > 0 && (
        <div className="mt-2 pt-2 border-t border-cream-dark/50 dark:border-slate-700/50 text-[10px] text-navy/30 dark:text-slate-600">
          Covers: {data.coverCount} signed ({data.cachedCovers} cached)
        </div>
      )}
    </div>
  );
}

function CardPanel({ data, onDismiss }: { data: CardProfilingData; onDismiss: () => void }) {
  return (
    <div className="w-80 bg-white dark:bg-dark-surface rounded-xl shadow-modal dark:shadow-none border border-cream-dark dark:border-slate-700 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-purple-500">Card Profile</span>
        <button
          onClick={onDismiss}
          className="p-0.5 rounded text-navy/30 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Summary */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">{formatMs(data.totalMs)}</span>
        <span className="text-[10px] text-navy/40 dark:text-slate-500 truncate max-w-40">{data.cardTitle}</span>
      </div>

      {/* Phase breakdown */}
      <PhaseTable phases={data.phases} totalMs={data.totalMs} />
    </div>
  );
}

function PagePanel({ data, onDismiss }: { data: PageProfilingData; onDismiss: () => void }) {
  return (
    <div className="w-80 bg-white dark:bg-dark-surface rounded-xl shadow-modal dark:shadow-none border border-cream-dark dark:border-slate-700 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-500">Page Profile</span>
        <button
          onClick={onDismiss}
          className="p-0.5 rounded text-navy/30 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Summary */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">{formatMs(data.totalMs)}</span>
        <span className="text-[10px] text-navy/40 dark:text-slate-500">{data.pageName}</span>
      </div>

      {/* Phase breakdown */}
      {data.phases.length > 0 ? (
        <PhaseTable phases={data.phases} totalMs={data.totalMs} />
      ) : (
        <div className="text-[11px] text-navy/40 dark:text-slate-500 font-body">
          No tracked phases (static page)
        </div>
      )}
    </div>
  );
}

export default function ProfilingPopup() {
  const {
    boardProfiling, cardProfiling, pageProfiling,
    showBoardPopup, showCardPopup, showPagePopup,
    enabled,
    dismissBoard, dismissCard, dismissPage, setEnabled,
  } = useProfilingStore();

  // Hydrate enabled state from localStorage on mount (default is enabled, only disable if explicitly set)
  useEffect(() => {
    const stored = localStorage.getItem('profiling_enabled');
    if (stored === 'false') {
      setEnabled(false);
    }
  }, [setEnabled]);

  if (!showBoardPopup && !showCardPopup && !showPagePopup) return null;

  return createPortal(
    <div className="fixed bottom-20 right-4 z-[9999] flex flex-col gap-2">
      {showPagePopup && pageProfiling && (
        <PagePanel data={pageProfiling} onDismiss={dismissPage} />
      )}
      {showCardPopup && cardProfiling && (
        <CardPanel data={cardProfiling} onDismiss={dismissCard} />
      )}
      {showBoardPopup && boardProfiling && (
        <BoardPanel data={boardProfiling} onDismiss={dismissBoard} />
      )}
    </div>,
    document.body
  );
}
