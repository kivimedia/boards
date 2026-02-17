'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  lastSeen: string;
}

interface UsePresenceOptions {
  channelName: string; // e.g., 'board:uuid' or 'card:uuid'
}

export function usePresence({ channelName }: UsePresenceOptions) {
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);
  const supabase = createClient();
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!user || !profile) return;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = [];
        for (const [_key, presences] of Object.entries(state)) {
          const p = (presences as any[])[0];
          if (p) {
            users.push({
              userId: p.userId || _key,
              displayName: p.displayName || 'Unknown',
              avatarUrl: p.avatarUrl || null,
              lastSeen: p.lastSeen || new Date().toISOString(),
            });
          }
        }
        setPresentUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: user.id,
            displayName: profile.display_name,
            avatarUrl: profile.avatar_url,
            lastSeen: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile?.display_name, channelName]);

  return { presentUsers };
}
