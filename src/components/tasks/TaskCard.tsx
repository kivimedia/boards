'use client';

import Link from 'next/link';
import type { MyTask } from '@/lib/my-tasks';
import { slugify } from '@/lib/slugify';

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#10b981',
  none: '#94a3b8',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
};

function formatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function relativeTime(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return formatDueDate(dateStr);
}

interface TaskCardProps {
  task: MyTask;
}

export default function TaskCard({ task }: TaskCardProps) {
  const borderColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.none;
  const href = `/board/${slugify(task.boardName)}?card=${task.cardId}`;
  const hasChecklist = task.checklistTotal > 0;
  const checklistPercent = hasChecklist ? Math.round((task.checklistDone / task.checklistTotal) * 100) : 0;

  return (
    <Link
      href={href}
      className="block bg-white dark:bg-navy-light rounded-xl p-4 shadow-card border-l-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group"
      style={{ borderLeftColor: borderColor }}
    >
      {/* Top row: Title + updated time */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-navy dark:text-white leading-snug group-hover:text-electric transition-colors">
          {task.title}
        </h3>
        {task.updatedAt && (
          <span className="text-[10px] text-navy/30 dark:text-white/30 whitespace-nowrap shrink-0 mt-0.5">
            {relativeTime(task.updatedAt)}
          </span>
        )}
      </div>

      {/* Board & List chips */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-electric/10 text-electric">
          {task.boardName}
        </span>
        <span className="text-[11px] text-navy/40 dark:text-white/40">
          {task.listName}
        </span>
      </div>

      {/* Priority + Due date + meta icons row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Priority badge */}
        {task.priority && task.priority !== 'none' && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
            style={{ backgroundColor: borderColor }}
          >
            {PRIORITY_LABELS[task.priority]}
          </span>
        )}

        {/* Due date */}
        {task.dueDate && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              task.isOverdue
                ? 'text-danger bg-danger/10 px-2 py-0.5 rounded-full'
                : task.isDueSoon
                ? 'text-warning bg-warning/10 px-2 py-0.5 rounded-full'
                : 'text-navy/50 dark:text-white/50'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {task.isOverdue ? 'Overdue: ' : ''}{formatDueDate(task.dueDate)}
          </span>
        )}

        {/* Spacer to push meta icons right */}
        <div className="flex-1" />

        {/* Meta icons: checklist, comments, attachments */}
        <div className="flex items-center gap-3">
          {/* Checklist progress */}
          {hasChecklist && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              checklistPercent === 100 ? 'text-success' : 'text-navy/40 dark:text-white/40'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              {task.checklistDone}/{task.checklistTotal}
            </span>
          )}

          {/* Comments */}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-navy/40 dark:text-white/40">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {task.commentCount}
            </span>
          )}

          {/* Attachments */}
          {task.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-navy/40 dark:text-white/40">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              {task.attachmentCount}
            </span>
          )}
        </div>
      </div>

      {/* Labels */}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {task.labels.map((label) => (
            <span
              key={label}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-cream-dark dark:bg-white/10 text-navy/60 dark:text-white/60"
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
