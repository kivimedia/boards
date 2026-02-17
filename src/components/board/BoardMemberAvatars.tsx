'use client';

import { useEffect, useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import type { Profile } from '@/lib/types';

interface BoardMember {
  id: string;
  board_id: string;
  user_id: string;
  role: string;
  profile: Profile | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Owner',
  department_lead: 'Lead',
  member: 'Editor',
  guest: 'Viewer',
};

interface BoardMemberAvatarsProps {
  boardId: string;
  maxVisible?: number;
  /** Set of user IDs currently online on this board */
  onlineUserIds?: Set<string>;
  /** Set of user IDs that are away (idle) */
  awayUserIds?: Set<string>;
}

export default function BoardMemberAvatars({ boardId, maxVisible = 5, onlineUserIds, awayUserIds }: BoardMemberAvatarsProps) {
  const [members, setMembers] = useState<BoardMember[]>([]);

  useEffect(() => {
    fetch(`/api/boards/${boardId}/members`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMembers(data);
        } else if (data?.data && Array.isArray(data.data)) {
          setMembers(data.data);
        }
      })
      .catch(() => {});
  }, [boardId]);

  if (members.length === 0) return null;

  // Sort: online members first, then by role weight
  const sorted = [...members].sort((a, b) => {
    const aOnline = onlineUserIds?.has(a.user_id) ? 0 : 1;
    const bOnline = onlineUserIds?.has(b.user_id) ? 0 : 1;
    if (aOnline !== bOnline) return aOnline - bOnline;
    return 0;
  });

  const visible = sorted.slice(0, maxVisible);
  const remaining = sorted.length - visible.length;
  const onlineCount = onlineUserIds?.size ?? 0;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-2 items-center">
        {visible.map((m) => {
          const isOnline = onlineUserIds?.has(m.user_id) ?? false;
          const isAway = awayUserIds?.has(m.user_id) ?? false;
          const name = m.profile?.display_name || 'User';
          const role = ROLE_LABELS[m.role] || m.role;
          const statusLabel = isAway ? ' (Away)' : isOnline ? ' (Online)' : '';
          const tooltip = `${name} - ${role}${statusLabel}`;

          return (
            <div key={m.user_id} className="relative group/avatar" title={tooltip}>
              <Avatar
                name={name}
                src={m.profile?.avatar_url}
                size="sm"
                online={onlineUserIds ? isOnline : undefined}
                away={isAway}
              />
              {/* Hover tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-navy dark:bg-slate-800 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover/avatar:opacity-100 pointer-events-none transition-opacity z-50 font-body shadow-lg">
                <div className="font-medium">{name}</div>
                <div className="text-white/60">{role}{isAway ? ' - Away' : isOnline ? ' - Online' : ''}</div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-navy dark:border-t-slate-800" />
              </div>
            </div>
          );
        })}
        {remaining > 0 && (
          <div
            className="w-6 h-6 rounded-full bg-cream-dark dark:bg-slate-700 flex items-center justify-center text-[10px] font-medium text-navy/60 dark:text-slate-400 ring-2 ring-white dark:ring-dark-surface font-body"
            title={`${remaining} more member${remaining > 1 ? 's' : ''}`}
          >
            +{remaining}
          </div>
        )}
      </div>
      {onlineCount > 0 && (
        <span className="text-[10px] text-green-600 dark:text-green-400 font-body font-medium">
          {onlineCount} online
        </span>
      )}
    </div>
  );
}
