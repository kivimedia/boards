'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type PresenceStatus = 'online' | 'away';

export interface PresenceUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  lastSeen: string;
  status: PresenceStatus;
}

interface UsePresenceOptions {
  channelName: string; // e.g., 'board:uuid' or 'card:uuid'
  idleTimeoutMs?: number; // default 5 minutes
}

const IDLE_TIMEOUT_DEFAULT = 5 * 60 * 1000; // 5 minutes
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

export function usePresence({ channelName, idleTimeoutMs }: UsePresenceOptions) {
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);
  const supabase = createClient();
  const { user, profile } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentStatusRef = useRef<PresenceStatus>('online');
  const timeout = idleTimeoutMs ?? IDLE_TIMEOUT_DEFAULT;

  // Track presence status and broadcast updates
  const updateStatus = useCallback((newStatus: PresenceStatus) => {
    if (currentStatusRef.current === newStatus) return;
    currentStatusRef.current = newStatus;
    if (channelRef.current && user && profile) {
      channelRef.current.track({
        userId: user.id,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        lastSeen: new Date().toISOString(),
        status: newStatus,
      });
    }
  }, [user?.id, profile?.display_name, profile?.avatar_url]);

  // Reset idle timer on activity
  const resetIdleTimer = useCallback(() => {
    if (currentStatusRef.current === 'away') {
      updateStatus('online');
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      updateStatus('away');
    }, timeout);
  }, [timeout, updateStatus]);

  useEffect(() => {
    if (!user || !profile) return;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });
    channelRef.current = channel;

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
              status: p.status || 'online',
            });
          }
        }
        setPresentUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          currentStatusRef.current = 'online';
          await channel.track({
            userId: user.id,
            displayName: profile.display_name,
            avatarUrl: profile.avatar_url,
            lastSeen: new Date().toISOString(),
            status: 'online',
          });
        }
      });

    // Set up idle detection
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, resetIdleTimer, { passive: true });
    }
    // Start initial idle timer
    idleTimerRef.current = setTimeout(() => {
      updateStatus('away');
    }, timeout);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, resetIdleTimer);
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [user?.id, profile?.display_name, channelName]);

  return { presentUsers };
}
