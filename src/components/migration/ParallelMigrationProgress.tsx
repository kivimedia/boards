'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MigrationJob, MigrationReport } from '@/lib/types';
import BoardMigrationCard from './BoardMigrationCard';
import MigrationReportDisplay from './MigrationReport';

interface ParallelMigrationProgressProps {
  parentJobId: string;
}

interface StatusResponse {
  parent: MigrationJob;
  children: MigrationJob[];
  overall_percent: number;
}

export default function ParallelMigrationProgress({ parentJobId }: ParallelMigrationProgressProps) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState('');
  const resumingRef = useRef<Set<string>>(new Set());

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/migration/jobs/${parentJobId}/status`);
      if (!res.ok) {
        setError('Failed to fetch status');
        return;
      }
      const json = await res.json();
      if (json.data) {
        setStatus(json.data as StatusResponse);
        setError('');
      }
    } catch {
      // silently fail, will retry
    }
  }, [parentJobId]);

  // Poll every 1.5s
  useEffect(() => {
    pollStatus();
    const interval = setInterval(pollStatus, 1500);
    return () => clearInterval(interval);
  }, [pollStatus]);

  // Auto-resume children that need it
  useEffect(() => {
    if (!status) return;
    for (const child of status.children) {
      const needsResume = child.status === 'pending' && (child.progress as any)?.needs_resume;
      if (needsResume && !resumingRef.current.has(child.id)) {
        resumingRef.current.add(child.id);
        fetch(`/api/migration/jobs/${child.id}/run-board`, { method: 'POST' }).catch(() => {});
        // Allow re-resume after 10s
        setTimeout(() => resumingRef.current.delete(child.id), 10000);
      }
    }
  }, [status]);

  const handleResume = (childJobId: string) => {
    if (resumingRef.current.has(childJobId)) return;
    resumingRef.current.add(childJobId);
    fetch(`/api/migration/jobs/${childJobId}/run-board`, { method: 'POST' }).catch(() => {});
    setTimeout(() => resumingRef.current.delete(childJobId), 10000);
  };

  if (error && !status) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
        <p className="text-sm text-red-600 dark:text-red-400 font-body">{error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-3 bg-cream-dark dark:bg-slate-700 rounded w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-cream dark:bg-navy rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { parent, children, overall_percent } = status;
  const isComplete = parent.status === 'completed' || parent.status === 'failed';
  const aggregatedReport = parent.report as MigrationReport | null;

  // Completed: show full report
  if (isComplete && aggregatedReport) {
    return (
      <>
        {parent.status === 'completed' && (
          <div className="text-center mb-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-1">
              Migration Complete
            </h3>
            <p className="text-sm text-navy/50 dark:text-slate-400 font-body">
              {children.length} board{children.length !== 1 ? 's' : ''} processed in parallel
            </p>
          </div>
        )}

        {/* Per-board final status grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {children.map((child) => (
            <BoardMigrationCard key={child.id} job={child} />
          ))}
        </div>

        <MigrationReportDisplay report={aggregatedReport} />
      </>
    );
  }

  // In progress: show live grid
  return (
    <>
      <div className="text-center">
        <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-1">
          Migration in Progress
        </h2>
        <p className="text-sm font-body text-navy/50 dark:text-slate-400">
          {children.length} board{children.length !== 1 ? 's' : ''} running in parallel - safe to refresh or close this page.
        </p>
      </div>

      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm font-body">
          <span className="text-navy/60 dark:text-slate-400">Overall Progress</span>
          <span className="text-navy dark:text-slate-100 font-medium">{overall_percent}%</span>
        </div>
        <div className="w-full bg-cream-dark dark:bg-slate-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-electric h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${overall_percent}%` }}
          />
        </div>
      </div>

      {/* Board grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {children.map((child) => (
          <BoardMigrationCard
            key={child.id}
            job={child}
            onResume={handleResume}
          />
        ))}
      </div>

      {/* Aggregated stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
        {(() => {
          let totalCards = 0, totalComments = 0, totalFiles = 0, totalLabels = 0, totalLists = 0, totalBoards = 0, totalChecklists = 0;
          for (const child of children) {
            const r = child.report as MigrationReport;
            if (!r) continue;
            totalBoards += r.boards_created || 0;
            totalLists += r.lists_created || 0;
            totalCards += r.cards_created || 0;
            totalComments += r.comments_created || 0;
            totalFiles += r.attachments_created || 0;
            totalLabels += r.labels_created || 0;
            totalChecklists += r.checklists_created || 0;
          }
          return [
            { label: 'Boards', value: totalBoards },
            { label: 'Lists', value: totalLists },
            { label: 'Cards', value: totalCards },
            { label: 'Comments', value: totalComments },
            { label: 'Files', value: totalFiles },
            { label: 'Labels', value: totalLabels },
            { label: 'Checklists', value: totalChecklists },
          ].map((stat) => (
            <div key={stat.label} className="bg-cream dark:bg-navy rounded-lg p-2 text-center">
              <p className="text-lg font-heading font-bold text-navy dark:text-slate-100">{stat.value}</p>
              <p className="text-[10px] font-body text-navy/40 dark:text-slate-500">{stat.label}</p>
            </div>
          ));
        })()}
      </div>

      {/* Spinner */}
      <div className="flex justify-center py-4">
        <svg className="animate-spin h-8 w-8 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    </>
  );
}
