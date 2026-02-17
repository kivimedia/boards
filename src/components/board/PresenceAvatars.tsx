'use client';

import Avatar from '@/components/ui/Avatar';
import { usePresence } from '@/hooks/usePresence';

interface PresenceAvatarsProps {
  channelName: string;
}

export default function PresenceAvatars({ channelName }: PresenceAvatarsProps) {
  const { presentUsers } = usePresence({ channelName });

  if (presentUsers.length === 0) return null;

  const visibleUsers = presentUsers.slice(0, 5);
  const remainingCount = presentUsers.length - visibleUsers.length;

  return (
    <div className="flex -space-x-2 items-center">
      {visibleUsers.map((user) => (
        <Avatar
          key={user.userId}
          name={user.displayName}
          src={user.avatarUrl}
          size="sm"
          online={true}
        />
      ))}
      {remainingCount > 0 && (
        <div className="w-6 h-6 rounded-full bg-cream-dark dark:bg-slate-700 flex items-center justify-center text-[10px] font-medium text-navy/60 dark:text-slate-400 ring-2 ring-white dark:ring-dark-surface font-body">
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
