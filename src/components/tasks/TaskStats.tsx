'use client';

import type { MyTask } from '@/lib/my-tasks';

type StatusFilter = 'overdue' | 'due_soon' | 'no_date' | null;

interface TaskStatsProps {
  tasks: MyTask[];
  activeFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
}

export default function TaskStats({ tasks, activeFilter, onFilterChange }: TaskStatsProps) {
  const total = tasks.length;
  const overdue = tasks.filter((t) => t.isOverdue).length;
  const dueSoon = tasks.filter((t) => t.isDueSoon).length;
  const noDate = tasks.filter((t) => !t.dueDate).length;

  const stats = [
    {
      key: null as StatusFilter,
      label: 'Total Tasks',
      count: total,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
      iconBg: 'bg-electric/10 dark:bg-electric/20',
      iconColor: 'text-electric',
      countColor: 'text-navy dark:text-white',
    },
    {
      key: 'overdue' as StatusFilter,
      label: 'Overdue',
      count: overdue,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
      iconBg: 'bg-danger/10 dark:bg-danger/20',
      iconColor: 'text-danger',
      countColor: overdue > 0 ? 'text-danger' : 'text-navy dark:text-white',
    },
    {
      key: 'due_soon' as StatusFilter,
      label: 'Due Soon',
      count: dueSoon,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      iconBg: 'bg-warning/10 dark:bg-warning/20',
      iconColor: 'text-warning',
      countColor: dueSoon > 0 ? 'text-warning' : 'text-navy dark:text-white',
    },
    {
      key: 'no_date' as StatusFilter,
      label: 'No Due Date',
      count: noDate,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      iconBg: 'bg-navy/5 dark:bg-white/10',
      iconColor: 'text-navy/40 dark:text-white/40',
      countColor: 'text-navy dark:text-white',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => {
        const isActive = activeFilter === stat.key;
        return (
          <button
            key={stat.label}
            onClick={() => onFilterChange(isActive ? null : stat.key)}
            className={`
              flex items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-200 text-left
              ${isActive
                ? 'border-electric bg-electric/5 dark:bg-electric/10 shadow-sm'
                : 'border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface hover:border-electric/30 dark:hover:border-electric/30'
              }
            `}
          >
            <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center shrink-0`}>
              <span className={stat.iconColor}>{stat.icon}</span>
            </div>
            <div>
              <p className={`text-2xl font-bold font-heading ${stat.countColor}`}>
                {stat.count}
              </p>
              <p className="text-[11px] text-navy/50 dark:text-white/50 font-medium">
                {stat.label}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
