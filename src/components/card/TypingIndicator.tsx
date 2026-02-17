'use client';

import { useTypingIndicator } from '@/hooks/useTypingIndicator';

interface TypingIndicatorProps {
  channelName: string;
}

export default function TypingIndicator({ channelName }: TypingIndicatorProps) {
  const { typingUsers } = useTypingIndicator({ channelName });

  if (typingUsers.length === 0) return null;

  const message =
    typingUsers.length === 1
      ? `${typingUsers[0].displayName} is typing...`
      : `${typingUsers[0].displayName} and ${typingUsers.length - 1} other${typingUsers.length - 1 > 1 ? 's' : ''} are typing...`;

  return (
    <div className="flex items-center gap-1 text-xs text-navy/40 dark:text-slate-500 italic font-body">
      <span className="flex gap-0.5">
        <span className="w-1 h-1 bg-navy/40 dark:bg-slate-500 rounded-full animate-typing-dot-1" />
        <span className="w-1 h-1 bg-navy/40 dark:bg-slate-500 rounded-full animate-typing-dot-2" />
        <span className="w-1 h-1 bg-navy/40 dark:bg-slate-500 rounded-full animate-typing-dot-3" />
      </span>
      <span>{message}</span>
    </div>
  );
}
