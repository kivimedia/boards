'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface EditLock {
  userId: string;
  displayName: string;
  field: string;
  timestamp: string;
}

interface UseEditLockOptions {
  cardId: string;
}

export function useEditLock({ cardId }: UseEditLockOptions) {
  const [locks, setLocks] = useState<EditLock[]>([]);
  const supabase = createClient();
  const { user, profile } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lockTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    if (!user || !cardId) return;

    const channel = supabase.channel(`editlock:card:${cardId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'lock' }, ({ payload }) => {
        if (payload.userId === user.id) return;

        setLocks((prev) => {
          const filtered = prev.filter(
            (l) => !(l.userId === payload.userId && l.field === payload.field)
          );
          return [...filtered, payload as EditLock];
        });

        // Auto-clear lock after 30 seconds
        const key = `${payload.userId}:${payload.field}`;
        const existing = lockTimeoutRef.current.get(key);
        if (existing) clearTimeout(existing);
        lockTimeoutRef.current.set(
          key,
          setTimeout(() => {
            setLocks((prev) =>
              prev.filter((l) => !(l.userId === payload.userId && l.field === payload.field))
            );
            lockTimeoutRef.current.delete(key);
          }, 30000)
        );
      })
      .on('broadcast', { event: 'unlock' }, ({ payload }) => {
        setLocks((prev) =>
          prev.filter((l) => !(l.userId === payload.userId && l.field === payload.field))
        );
        const key = `${payload.userId}:${payload.field}`;
        const existing = lockTimeoutRef.current.get(key);
        if (existing) {
          clearTimeout(existing);
          lockTimeoutRef.current.delete(key);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      lockTimeoutRef.current.forEach((t) => clearTimeout(t));
      lockTimeoutRef.current.clear();
    };
  }, [user?.id, cardId]);

  const acquireLock = useCallback(
    (field: string) => {
      if (!channelRef.current || !user || !profile) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'lock',
        payload: {
          userId: user.id,
          displayName: profile.display_name,
          field,
          timestamp: new Date().toISOString(),
        },
      });
    },
    [user?.id, profile?.display_name]
  );

  const releaseLock = useCallback(
    (field: string) => {
      if (!channelRef.current || !user) return;
      channelRef.current.send({
        type: 'broadcast',
        event: 'unlock',
        payload: { userId: user.id, field },
      });
    },
    [user?.id]
  );

  const isFieldLocked = useCallback(
    (field: string): EditLock | undefined => {
      return locks.find((l) => l.field === field && l.userId !== user?.id);
    },
    [locks, user?.id]
  );

  return { locks, acquireLock, releaseLock, isFieldLocked };
}
