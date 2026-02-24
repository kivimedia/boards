'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BoardWithLists } from '@/lib/types';
import type { BoardProfilingData } from '@/stores/profiling-store';

// Side-channel for passing timings from fetchBoard to the hook's useEffect
// without changing the React Query data shape
let lastTimings: BoardProfilingData | null = null;

export function getLastBoardTimings(): BoardProfilingData | null {
  const t = lastTimings;
  lastTimings = null;
  return t;
}

/** How many lists to load in the first (visible) phase */
const VISIBLE_LIST_COUNT = 6;
/** Max cards per list in phase 1 (keeps initial payload small for lists with 600+ cards) */
const PHASE1_MAX_CARDS_PER_LIST = 50;

/**
 * Two-phase board loading:
 * Phase 1: Load first N visible lists, max M cards per list (fast ~1-2s)
 * Phase 2: Load ALL lists with ALL cards in background, replace phase 1 data
 *
 * For small boards (<=VISIBLE_LIST_COUNT lists), phase 1 still caps cards per list,
 * then phase 2 loads the full data.
 */
async function fetchBoard(
  boardId: string,
  initialBoard?: BoardWithLists | null
): Promise<BoardWithLists | null> {
  const t0 = performance.now();

  const allListIds = initialBoard?.lists?.map((l: any) => l.id) || [];
  const hasManyLists = allListIds.length > VISIBLE_LIST_COUNT;

  // Phase 1: visible lists + capped cards per list
  let phase1Url = `/api/boards/${boardId}/data?maxCards=${PHASE1_MAX_CARDS_PER_LIST}`;
  if (hasManyLists) {
    phase1Url += `&lists=${allListIds.slice(0, VISIBLE_LIST_COUNT).join(',')}`
  }

  const res = await fetch(phase1Url);
  if (!res.ok) {
    console.error('[useBoard] API error:', res.status, res.statusText);
    return null;
  }

  const { board, timings } = await res.json();
  const tTotal = performance.now();

  if (!board) return null;

  // Store phase 1 timings
  lastTimings = {
    phases: [
      { name: 'Placements', ms: timings.placements },
      { name: 'Card metadata', ms: timings.metadata },
      { name: 'Profiles', ms: timings.profiles },
      { name: 'Indexing', ms: timings.indexing },
      { name: 'Cover signing', ms: timings.covers },
      { name: 'Network transfer', ms: (tTotal - t0) - timings.total },
    ],
    totalMs: tTotal - t0,
    cardCount: timings.cardCount,
    coverCount: timings.coverCount,
    cachedCovers: timings.cachedCovers,
    source: 'client',
    boardName: board.name,
  };

  return board;
}

/**
 * Phase 2: Fetch ALL lists with ALL cards (no limits).
 * Completely replaces phase 1 data with the full board.
 */
async function fetchFullBoard(boardId: string): Promise<BoardWithLists | null> {
  const res = await fetch(`/api/boards/${boardId}/data`);
  if (!res.ok) return null;
  const { board } = await res.json();
  return board || null;
}

export function useBoard(boardId: string, initialBoard?: BoardWithLists) {
  const queryClient = useQueryClient();
  const queryKey = ['board', boardId];
  const phase2FetchedRef = useRef(false);
  // Track whether this is the very first fetch (two-phase fast load) or a
  // subsequent invalidation refetch (go straight to full board — no phase-1 flash).
  const isFirstFetchRef = useRef(true);

  const query = useQuery({
    queryKey,
    queryFn: () => {
      if (isFirstFetchRef.current) {
        // Initial load: two-phase for fast time-to-interactive
        isFirstFetchRef.current = false;
        return fetchBoard(boardId, initialBoard);
      }
      // Re-fetch after real-time invalidation: skip phase 1 entirely.
      // React Query keeps showing the previous (full) data while this request
      // is in flight, so there is no intermediate partial-data flash.
      return fetchFullBoard(boardId);
    },
    enabled: !!boardId,
    // Use placeholderData (not initialData) so React Query always fetches fresh data.
    // initialData is treated as "real" cached data and may not trigger a refetch.
    placeholderData: initialBoard,
    staleTime: 30_000,   // treat data as fresh for 30s to reduce spurious refetches
    retry: 2,
    retryDelay: 1000,
  });

  // Phase 2: after phase 1 completes, fetch full board data in background
  // This loads ALL lists with ALL cards, replacing the capped phase 1 data
  useEffect(() => {
    if (!query.data || phase2FetchedRef.current) return;
    // Skip if query is still loading placeholder data
    if (query.isPlaceholderData) return;

    phase2FetchedRef.current = true;

    fetchFullBoard(boardId).then((fullBoard) => {
      if (fullBoard) {
        queryClient.setQueryData(queryKey, fullBoard);
      }
    });
  }, [query.data, query.isPlaceholderData, boardId, queryClient, queryKey]);

  // Reset phase refs when board changes (so new board gets fast two-phase load)
  useEffect(() => {
    phase2FetchedRef.current = false;
    isFirstFetchRef.current = true;
  }, [boardId]);

  // Push client-side timings to profiling store after each successful fetch
  useEffect(() => {
    if (query.dataUpdatedAt) {
      const timings = getLastBoardTimings();
      if (timings) {
        // Lazy import to avoid SSR issues
        import('@/stores/profiling-store').then(({ useProfilingStore }) => {
          // Hydrate enabled state from localStorage if explicitly disabled
          const stored = typeof window !== 'undefined' && localStorage.getItem('profiling_enabled');
          if (stored === 'false') {
            useProfilingStore.getState().setEnabled(false);
          }
          useProfilingStore.getState().setBoardProfiling(timings);
        });
      }
    }
  }, [query.dataUpdatedAt]);

  // PERFORMANCE: Debounced invalidation — batches rapid real-time changes.
  // Uses a longer debounce (2s) to avoid constant refetches from high-frequency events.
  // Subsequent fetches go straight to full board (no phase-1 flash — see queryFn above).
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedInvalidate = useCallback(() => {
    if (invalidateTimerRef.current) {
      clearTimeout(invalidateTimerRef.current);
    }
    invalidateTimerRef.current = setTimeout(() => {
      phase2FetchedRef.current = false;
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
      invalidateTimerRef.current = null;
    }, 2000);   // 2s debounce: batches bursts of drag-drop / bulk ops
  }, [queryClient, boardId]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (invalidateTimerRef.current) {
        clearTimeout(invalidateTimerRef.current);
      }
    };
  }, []);

  // Real-time subscriptions that invalidate the query (debounced)
  useEffect(() => {
    if (!boardId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`board-${boardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cards' },
        () => debouncedInvalidate()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_placements' },
        () => debouncedInvalidate()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lists',
          filter: `board_id=eq.${boardId}`,
        },
        () => debouncedInvalidate()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_labels' },
        () => debouncedInvalidate()
      )
      // NOTE: comments subscription removed — comment_count changes are low-priority
      // and were causing constant board refetches. Comment counts update on next
      // manual refresh or board navigation.
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, queryClient, debouncedInvalidate]);

  const refresh = () => {
    phase2FetchedRef.current = false;
    queryClient.invalidateQueries({ queryKey });
  };

  return {
    board: query.data ?? null,
    loading: query.isLoading,
    isPlaceholderData: query.isPlaceholderData,
    error: query.error,
    refresh,
  };
}
