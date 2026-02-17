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

interface BoardMemberAvatarsProps {
  boardId: string;
  maxVisible?: number;
}

export default function BoardMemberAvatars({ boardId, maxVisible = 5 }: BoardMemberAvatarsProps) {
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

  const visible = members.slice(0, maxVisible);
  const remaining = members.length - visible.length;

  return (
    <div className="flex -space-x-2 items-center">
      {visible.map((m) => (
        <div key={m.user_id} className="relative" title={m.profile?.display_name || 'Member'}>
          <Avatar
            name={m.profile?.display_name || 'User'}
            src={m.profile?.avatar_url}
            size="sm"
          />
        </div>
      ))}
      {remaining > 0 && (
        <div className="w-6 h-6 rounded-full bg-cream-dark dark:bg-slate-700 flex items-center justify-center text-[10px] font-medium text-navy/60 dark:text-slate-400 ring-2 ring-white dark:ring-dark-surface font-body">
          +{remaining}
        </div>
      )}
    </div>
  );
}
