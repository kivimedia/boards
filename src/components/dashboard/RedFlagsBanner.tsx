'use client';

import Link from 'next/link';
import type { RedFlags } from '@/lib/types';

interface RedFlagsBannerProps {
  flags: RedFlags;
}

export default function RedFlagsBanner({ flags }: RedFlagsBannerProps) {
  const total =
    flags.overdueCards +
    flags.failedUpdates +
    flags.pendingApprovalUpdates +
    flags.flaggedTickets;

  if (total === 0) return null;

  const items: { label: string; count: number; href: string; color: string }[] = [];

  if (flags.overdueCards > 0) {
    items.push({
      label: 'overdue',
      count: flags.overdueCards,
      href: '/my-tasks?filter=overdue',
      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    });
  }
  if (flags.failedUpdates > 0) {
    items.push({
      label: 'failed updates',
      count: flags.failedUpdates,
      href: '/clients',
      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    });
  }
  if (flags.pendingApprovalUpdates > 0) {
    items.push({
      label: 'pending approval',
      count: flags.pendingApprovalUpdates,
      href: '/clients',
      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    });
  }
  if (flags.flaggedTickets > 0) {
    items.push({
      label: 'flagged tickets',
      count: flags.flaggedTickets,
      href: '/performance',
      color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    });
  }

  return (
    <div className="bg-red-50 dark:bg-red-950/20 border-l-4 border-red-400 dark:border-red-600 rounded-2xl px-5 py-3.5 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2 shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-xs font-semibold text-red-700 dark:text-red-400 font-heading">
          Needs attention
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold font-body transition-opacity hover:opacity-80 ${item.color}`}
          >
            <span className="font-bold">{item.count}</span>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
