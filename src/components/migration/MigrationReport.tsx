'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MigrationReport as MigrationReportType } from '@/lib/types';

interface MigrationReportProps {
  report: MigrationReportType;
}

export default function MigrationReport({ report }: MigrationReportProps) {
  const router = useRouter();
  const [errorsExpanded, setErrorsExpanded] = useState(false);

  const hasMergeStats = (report.cards_updated ?? 0) > 0 || (report.checklist_items_updated ?? 0) > 0;

  const stats = [
    { label: 'Boards', value: report.boards_created, icon: 'board' },
    { label: 'Lists', value: report.lists_created, icon: 'list' },
    { label: 'Cards', value: report.cards_created, icon: 'card' },
    ...(hasMergeStats ? [{ label: 'Cards Updated', value: report.cards_updated ?? 0, icon: 'card' }] : []),
    { label: 'Comments', value: report.comments_created, icon: 'comment' },
    { label: 'Attachments', value: report.attachments_created, icon: 'attachment' },
    { label: 'Labels', value: report.labels_created, icon: 'label' },
    { label: 'Checklists', value: report.checklists_created, icon: 'checklist' },
    ...(hasMergeStats ? [{ label: 'Items Updated', value: report.checklist_items_updated ?? 0, icon: 'checklist' }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="text-xl font-heading font-semibold text-navy dark:text-slate-100 mb-1">
          Migration Complete
        </h3>
        <p className="text-navy/50 dark:text-slate-400 font-body text-sm">
          Your Trello data has been successfully imported.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-cream dark:bg-navy rounded-xl p-4 text-center"
          >
            <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">
              {stat.value}
            </p>
            <p className="text-xs font-body text-navy/50 dark:text-slate-400 mt-1">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Errors Section */}
      {report.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setErrorsExpanded(!errorsExpanded)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-red-100/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-sm font-medium text-red-700">
                {report.errors.length} error{report.errors.length !== 1 ? 's' : ''} occurred
              </span>
            </div>
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
              className={`text-red-400 transition-transform ${errorsExpanded ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {errorsExpanded && (
            <div className="px-4 pb-4 space-y-2">
              {report.errors.map((error, i) => (
                <p key={i} className="text-xs font-body text-red-600 bg-red-100 rounded-lg p-2">
                  {error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Done Button */}
      <div className="flex justify-center pt-2">
        <button
          onClick={() => router.push('/settings')}
          className="px-6 py-2.5 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
