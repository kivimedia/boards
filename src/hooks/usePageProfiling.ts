'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useProfilingStore, ProfilingPhase } from '@/stores/profiling-store';

/**
 * Hook for profiling page load times on non-board pages.
 *
 * Usage:
 *   const profiling = usePageProfiling('Settings');
 *
 *   // In your data fetches:
 *   const start = profiling.startPhase();
 *   const data = await fetchSomething();
 *   profiling.endPhase('Fetch profiles', start);
 *
 *   // When page is fully loaded:
 *   profiling.finish();
 */
export function usePageProfiling(pageName: string) {
  const mountTime = useRef(performance.now());
  const phases = useRef<ProfilingPhase[]>([]);
  const finished = useRef(false);

  // Reset on page name change
  useEffect(() => {
    mountTime.current = performance.now();
    phases.current = [];
    finished.current = false;
  }, [pageName]);

  const startPhase = useCallback(() => performance.now(), []);

  const endPhase = useCallback((name: string, startMs: number) => {
    if (finished.current) return;
    phases.current.push({ name, ms: performance.now() - startMs });
  }, []);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    const totalMs = performance.now() - mountTime.current;
    useProfilingStore.getState().setPageProfiling({
      phases: [...phases.current],
      totalMs,
      pageName,
    });
  }, [pageName]);

  return { startPhase, endPhase, finish };
}
