'use client';

import { useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UseOptimisticLockOptions {
  cardId: string;
  onConflict: (conflictUser: string) => void;
}

export function useOptimisticLock({ cardId, onConflict }: UseOptimisticLockOptions) {
  const [knownVersion, setKnownVersion] = useState<number | null>(null);
  const supabase = createClient();
  const versionRef = useRef<number | null>(null);

  const loadVersion = useCallback(async () => {
    const { data } = await supabase
      .from('cards')
      .select('version')
      .eq('id', cardId)
      .single();

    if (data) {
      setKnownVersion(data.version);
      versionRef.current = data.version;
    }
    return data?.version ?? null;
  }, [cardId]);

  const saveWithLock = useCallback(
    async (
      updates: Record<string, unknown>,
      expectedVersion?: number
    ): Promise<{ success: boolean; data?: any }> => {
      const version = expectedVersion ?? versionRef.current;
      if (version == null) {
        // No version tracking, save normally
        const { data, error } = await supabase
          .from('cards')
          .update(updates)
          .eq('id', cardId)
          .select()
          .single();

        if (error) return { success: false };
        return { success: true, data };
      }

      // Attempt to update only if version matches
      const { data, error } = await supabase
        .from('cards')
        .update(updates)
        .eq('id', cardId)
        .eq('version', version)
        .select()
        .single();

      if (error || !data) {
        // Version mismatch — someone else edited the card
        // Fetch the current card to find who edited it
        const { data: current } = await supabase
          .from('cards')
          .select('version, updated_by_name')
          .eq('id', cardId)
          .single();

        if (current && current.version !== version) {
          onConflict(current.updated_by_name || 'another user');
          return { success: false };
        }

        return { success: false };
      }

      // Update known version
      setKnownVersion(data.version);
      versionRef.current = data.version;
      return { success: true, data };
    },
    [cardId, onConflict]
  );

  const forceOverwrite = useCallback(
    async (updates: Record<string, unknown>): Promise<{ success: boolean; data?: any }> => {
      const { data, error } = await supabase
        .from('cards')
        .update(updates)
        .eq('id', cardId)
        .select()
        .single();

      if (error) return { success: false };
      setKnownVersion(data.version);
      versionRef.current = data.version;
      return { success: true, data };
    },
    [cardId]
  );

  return { knownVersion, loadVersion, saveWithLock, forceOverwrite };
}
