'use client';

import { usePresence } from '@/hooks/usePresence';
import { useAuth } from '@/hooks/useAuth';

interface CardPresenceBarProps {
  cardId: string;
}

export default function CardPresenceBar({ cardId }: CardPresenceBarProps) {
  const { presentUsers } = usePresence({ channelName: `card:${cardId}` });
  const { user } = useAuth();

  // Filter out the current user
  const otherUsers = presentUsers.filter((u) => u.userId !== user?.id);

  if (otherUsers.length === 0) return null;

  const names = otherUsers.map((u) => u.displayName);

  return (
    <div className="flex items-center gap-1 text-xs text-navy/40 dark:text-slate-500 font-body">
      <span className="w-2 h-2 bg-green-400 rounded-full shrink-0" />
      <span>
        Also viewing: {names.join(', ')}
      </span>
    </div>
  );
}
