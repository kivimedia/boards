'use client';

import type { TeamMemberWorkload } from '@/lib/team-view';
import Avatar from '@/components/ui/Avatar';
import WorkloadBar from './WorkloadBar';

interface MemberColumnProps {
  member: TeamMemberWorkload;
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return '';
  const d = new Date(dueDate);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function MemberColumn({ member }: MemberColumnProps) {
  return (
    <div className="bg-white dark:bg-navy-light rounded-2xl p-4 min-w-[280px] shadow-card">
      {/* Header: avatar + name + role */}
      <div className="flex items-center gap-3 mb-4">
        <Avatar
          name={member.displayName}
          src={member.avatarUrl}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-navy dark:text-white truncate">
            {member.displayName}
          </h3>
          <p className="text-[11px] text-navy/40 dark:text-white/40 capitalize">
            {member.role}
          </p>
        </div>
      </div>

      {/* Workload bar */}
      <div className="mb-4">
        <WorkloadBar
          total={member.totalCards}
          overdue={member.overdueCards}
          dueSoon={member.dueSoonCards}
        />
      </div>

      {/* Cards list */}
      {member.cards.length > 0 && (
        <div className="space-y-2">
          {member.cards.map((card) => (
            <div
              key={card.id}
              className="px-3 py-2 rounded-lg bg-cream dark:bg-white/5 border border-cream-dark dark:border-white/10"
            >
              <p className="text-xs font-medium text-navy dark:text-white leading-snug truncate">
                {card.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-navy/40 dark:text-white/40 truncate">
                  {card.boardName}
                </span>
                {card.dueDate && (
                  <span className="text-[10px] text-navy/40 dark:text-white/40 shrink-0">
                    {formatDueDate(card.dueDate)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {member.cards.length === 0 && (
        <p className="text-xs text-navy/30 dark:text-white/30 text-center py-4">
          No cards assigned
        </p>
      )}
    </div>
  );
}
