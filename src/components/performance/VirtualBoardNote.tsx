'use client';

interface VirtualBoardNoteProps {
  cardCount: number;
  threshold?: number;
}

export default function VirtualBoardNote({ cardCount, threshold = 500 }: VirtualBoardNoteProps) {
  if (cardCount <= threshold) return null;

  return (
    <div className="rounded-2xl border border-electric/20 bg-electric/5 px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-electric"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
            Virtual Scrolling Active
          </h4>
          <p className="text-xs text-navy/60 dark:text-slate-400 font-body mt-1">
            This board contains <span className="font-semibold text-electric">{cardCount.toLocaleString()}</span> cards,
            exceeding the {threshold.toLocaleString()}-card threshold. Virtual scrolling is enabled to maintain
            smooth performance. Only visible cards are rendered in the DOM at any given time.
          </p>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-navy/50 dark:text-slate-400 font-body">Rendering optimized</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-navy/50 dark:text-slate-400 font-body">Cursor pagination enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
