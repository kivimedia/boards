'use client';

interface WeeklyGanttHeaderProps {
  clientName: string;
  weekStart: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onCopyLastWeek: () => void;
  onSendEmail: () => void;
  onPrint: () => void;
  onSaveSnapshot: () => void;
  onToggleHistory: () => void;
  sending: boolean;
  taskCount: number;
  completedCount: number;
}

export function WeeklyGanttHeader({
  clientName,
  weekStart,
  onPrevWeek,
  onNextWeek,
  onToday,
  onCopyLastWeek,
  onSendEmail,
  onPrint,
  onSaveSnapshot,
  onToggleHistory,
  sending,
  taskCount,
  completedCount,
}: WeeklyGanttHeaderProps) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${formatShort(weekStart)} – ${formatShort(weekEnd.toISOString().split('T')[0])}`;

  return (
    <div className="shrink-0 border-b border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface px-4 py-3 print:hidden">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Left: Client name + week nav */}
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-navy dark:text-slate-100 font-heading">
            {clientName}
          </h2>
          <div className="flex items-center gap-1 bg-cream dark:bg-slate-800 rounded-lg px-1 py-0.5">
            <button
              type="button"
              onClick={onPrevWeek}
              className="p-1 rounded hover:bg-cream-dark dark:hover:bg-slate-700 text-navy/60 dark:text-slate-400"
              title="Previous week"
            >
              <ChevronLeft />
            </button>
            <span className="text-xs font-medium text-navy/70 dark:text-slate-300 font-body px-2 min-w-[140px] text-center">
              {weekLabel}
            </span>
            <button
              type="button"
              onClick={onNextWeek}
              className="p-1 rounded hover:bg-cream-dark dark:hover:bg-slate-700 text-navy/60 dark:text-slate-400"
              title="Next week"
            >
              <ChevronRight />
            </button>
          </div>
          <button
            type="button"
            onClick={onToday}
            className="text-[11px] font-medium text-electric hover:text-electric/80 font-body"
          >
            Today
          </button>
          {taskCount > 0 && (
            <span className="text-[11px] text-navy/40 dark:text-slate-500 font-body">
              {completedCount}/{taskCount} done
            </span>
          )}
        </div>

        {/* Right: Action buttons */}
        <div className="flex items-center gap-1.5">
          <HeaderButton onClick={onCopyLastWeek} title="Copy from last week">
            <CopyIcon />
            <span>Copy Last Week</span>
          </HeaderButton>
          <HeaderButton onClick={onSaveSnapshot} title="Save snapshot">
            <CameraIcon />
          </HeaderButton>
          <HeaderButton onClick={onToggleHistory} title="View history">
            <HistoryIcon />
          </HeaderButton>
          <HeaderButton onClick={onPrint} title="Print">
            <PrintIcon />
          </HeaderButton>
          <button
            type="button"
            onClick={onSendEmail}
            disabled={sending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-electric text-white text-xs font-medium font-body hover:bg-electric/90 disabled:opacity-50 transition-colors"
            title="Email weekly chart"
          >
            <EmailIcon />
            <span>{sending ? 'Sending...' : 'Email'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared button wrapper ────────────────────────────────────────────
function HeaderButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-navy/60 dark:text-slate-400 hover:bg-cream dark:hover:bg-slate-800 font-body transition-colors"
    >
      {children}
    </button>
  );
}

// ── Inline SVG Icons ─────────────────────────────────────────────────
function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

// ── Helper ────────────────────────────────────────────────────────────
function formatShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
