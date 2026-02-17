'use client';

import type { MyTask } from '@/lib/my-tasks';

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface TaskCardProps {
  task: MyTask;
}

export default function TaskCard({ task }: TaskCardProps) {
  const borderColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.none;

  return (
    <div
      className="bg-white dark:bg-navy-light rounded-xl p-4 shadow-card border-l-4 transition-all duration-200 hover:shadow-md"
      style={{ borderLeftColor: borderColor }}
    >
      {/* Title */}
      <h3 className="text-sm font-semibold text-navy dark:text-white mb-2 leading-snug">
        {task.title}
      </h3>

      {/* Board & List chips */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-electric/10 text-electric">
          {task.boardName}
        </span>
        <span className="text-[11px] text-navy/40 dark:text-white/40">
          {task.listName}
        </span>
      </div>

      {/* Priority + Due date row */}
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
    </div>
  );
}
