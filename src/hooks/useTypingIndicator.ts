'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TypingUser {
  userId: string;
  displayName: string;
}

interface UseTypingIndicatorOptions {
  channelName: string; // e.g., 'typing:card:uuid'
}

export function useTypingIndicator({ channelName }: UseTypingIndicatorOptions) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const supabase = createClient();
  const { user, profile } = useAuth();
  const timeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(channelName);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === user.id) return;

        setTypingUsers((prev) => {
          const exists = prev.some((u) => u.userId === payload.userId);
          if (!exists) {
            return [...prev, { userId: payload.userId, displayName: payload.displayName }];
          }
          return prev;
        });

        // Clear after 3 seconds of no typing
        if (timeoutRef.current[payload.userId]) {
          clearTimeout(timeoutRef.current[payload.userId]);
        }
        timeoutRef.current[payload.userId] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
          delete timeoutRef.current[payload.userId];
        }, 3000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      Object.values(timeoutRef.current).forEach(clearTimeout);
    };
  }, [user?.id, channelName]);

  const sendTyping = useCallback(() => {
    if (!channelRef.current || !user || !profile) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        userId: user.id,
        displayName: profile.display_name,
      },
    });
  }, [user?.id, profile?.display_name]);

  return { typingUsers, sendTyping };
}
