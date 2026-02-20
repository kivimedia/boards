'use client';

import type { MigrationJob, MigrationReport, MigrationBoardProgress } from '@/lib/types';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';

interface BoardMigrationCardProps {
  job: MigrationJob;
  onResume?: (jobId: string) => void;
}

const PHASE_LABELS: Record<string, string> = {
  pending: 'Waiting...',
  importing_board: 'Creating board',
  importing_labels: 'Importing labels',
  importing_lists: 'Importing lists',
  importing_cards: 'Importing cards',
  importing_attachments: 'Importing attachments',
  resolving_covers: 'Resolving covers',
  importing_comments_checklists: 'Comments + checklists',
  completed: 'Completed',
};

export default function BoardMigrationCard({ job, onResume }: BoardMigrationCardProps) {
  const progress = job.progress as unknown as MigrationBoardProgress | null;
  const report = job.report as MigrationReport | null;
  const boardType = job.config?.board_type_mapping?.[job.trello_board_id || ''];
  const typeConfig = boardType ? BOARD_TYPE_CONFIG[boardType] : null;
  const needsResume = job.status === 'pending' && (progress as any)?.needs_resume;

  // Determine card state
  let borderColor = 'border-cream-dark dark:border-slate-700';
  let bgPulse = '';

  if (job.status === 'running') {
    borderColor = 'border-blue-400 dark:border-blue-500';
    bgPulse = 'animate-pulse';
  } else if (job.status === 'completed') {
    borderColor = 'border-green-400 dark:border-green-500';
  } else if (job.status === 'failed') {
    borderColor = 'border-red-400 dark:border-red-500';
  } else if (needsResume) {
    borderColor = 'border-amber-400 dark:border-amber-500';
  }

  // Phase progress percent (rough mapping: 6 phases)
  const phaseWeights: Record<string, number> = {
    pending: 0, importing_board: 5, importing_labels: 10, importing_lists: 15,
    importing_cards: 50, importing_attachments: 75, resolving_covers: 80,
    importing_comments_checklists: 90, completed: 100,
  };
  const phasePercent = progress?.phase ? (phaseWeights[progress.phase] ?? 0) : 0;

  return (
    <div className={`rounded-xl border-2 ${borderColor} bg-white dark:bg-dark-surface p-4 space-y-3 transition-colors`}>
      {/* Header: board name + type badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {typeConfig && <span className="text-sm shrink-0">{typeConfig.icon}</span>}
          <h4 className="text-sm font-heading font-semibold text-navy dark:text-slate-100 truncate">
            {job.trello_board_name || 'Board'}
          </h4>
        </div>
        {/* Status indicator */}
        {job.status === 'completed' && (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {job.status === 'failed' && (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        )}
        {job.status === 'running' && (
          <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
      </div>

      {/* Phase label + progress bar */}
      {job.status === 'running' && progress && (
        <>
          <div className="flex items-center justify-between text-xs font-body">
            <span className={`text-navy/60 dark:text-slate-400 ${bgPulse}`}>
              {progress.phase_label || PHASE_LABELS[progress.phase] || progress.phase}
            </span>
            <span className="text-navy/40 dark:text-slate-500 font-mono">
              {phasePercent}%
            </span>
          </div>
          <div className="w-full bg-cream-dark dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${phasePercent}%` }}
            />
          </div>
        </>
      )}

      {/* Detail line */}
      {job.status === 'running' && progress?.detail && (
        <p className="text-[10px] font-mono text-navy/40 dark:text-slate-500 truncate">
          {progress.detail}
        </p>
      )}

      {/* Pending state */}
      {job.status === 'pending' && !needsResume && (
        <p className="text-xs font-body text-navy/40 dark:text-slate-500">Waiting...</p>
      )}

      {/* Needs resume state */}
      {needsResume && onResume && (
        <button
          onClick={() => onResume(job.id)}
          className="w-full px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-heading font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
        >
          Resume
        </button>
      )}

      {/* Mini stats row */}
      {report && (job.status === 'running' || job.status === 'completed' || job.status === 'failed') && (
        <div className="flex gap-2 text-[10px] font-body text-navy/40 dark:text-slate-500">
          {report.cards_created > 0 && <span>{report.cards_created} cards</span>}
          {report.comments_created > 0 && <span>{report.comments_created} comments</span>}
          {report.attachments_created > 0 && <span>{report.attachments_created} files</span>}
          {(report.errors?.length || 0) > 0 && (
            <span className="text-red-500">{report.errors.length} err</span>
          )}
        </div>
      )}

      {/* Failed: error details */}
      {job.status === 'failed' && job.error_message && (
        <p className="text-[10px] text-red-500 font-body truncate" title={job.error_message}>
          {job.error_message}
        </p>
      )}
    </div>
  );
}
