'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useProfilingStore } from '@/stores/profiling-store';

// Friendly names for common API paths
const API_LABELS: Record<string, string> = {
  '/api/team/profiles': 'Fetch team profiles',
  '/api/boards': 'Fetch boards',
  '/api/search': 'Search',
  '/api/migration/jobs': 'Fetch migration jobs',
  '/api/podcast/integrations': 'Fetch integrations',
  '/api/podcast/candidates': 'Fetch candidates',
  '/api/podcast/costs': 'Fetch costs',
  '/api/productivity': 'Fetch productivity data',
  '/api/agents': 'Fetch agents',
  '/api/dedup': 'Fetch dedup data',
  '/api/cron': 'Cron check',
  '/api/board-assistant': 'AI assistant',
};

function labelForUrl(url: string): string | null {
  // Skip non-API requests (images, css, js, etc)
  if (!url.includes('/api/')) return null;
  try {
    const path = new URL(url, 'http://localhost').pathname;
    // Check exact matches first
    for (const [prefix, label] of Object.entries(API_LABELS)) {
      if (path.startsWith(prefix)) return label;
    }
    // Fallback: extract meaningful part after /api/
    const parts = path.replace('/api/', '').split('/');
    return `API: ${parts.slice(0, 2).join('/')}`;
  } catch {
    return null;
  }
}

// Map pathname to page name
function pageNameFromPath(pathname: string): string {
  const map: Record<string, string> = {
    '/settings': 'Settings',
    '/settings/migration': 'Migration',
    '/settings/users': 'User Management',
    '/settings/agents': 'Agent Skills',
    '/settings/ai': 'AI Config',
    '/settings/podcast': 'Podcast Config',
    '/settings/backups': 'Backups',
    '/settings/board-maintenance': 'Board Maintenance',
    '/settings/qa': 'QA Monitoring',
    '/settings/whatsapp': 'WhatsApp Config',
    '/settings/integrations': 'Integrations',
    '/my-tasks': 'My Tasks',
    '/dashboard': 'Dashboard',
    '/clients': 'Clients',
    '/team': 'Team',
    '/analytics': 'Analytics',
    '/productivity': 'Productivity',
    '/revisions': 'Revisions',
    '/reports': 'Reports',
    '/assets': 'Assets',
    '/wiki': 'Wiki',
    '/time': 'Time Tracking',
    '/agents': 'Agent Launcher',
  };
  // Exact match
  if (map[pathname]) return map[pathname];
  // Prefix match for nested routes
  for (const [prefix, name] of Object.entries(map)) {
    if (pathname.startsWith(prefix + '/')) return name;
  }
  // Board pages are handled by BoardView profiling, skip them
  if (pathname.startsWith('/board/')) return '';
  // Fallback
  const last = pathname.split('/').filter(Boolean).pop() || 'Page';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/**
 * Automatic page profiler. Placed in the global Providers, it watches
 * for route changes and tracks API fetch durations via PerformanceObserver.
 * On non-board pages it pushes a PageProfilingData to the profiling store.
 */
export default function PageProfiler() {
  const pathname = usePathname();
  const mountTimeRef = useRef(performance.now());
  const fetchPhases = useRef<Map<string, number>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackedRef = useRef('');

  useEffect(() => {
    // Skip board pages (they have their own profiling)
    if (pathname.startsWith('/board/')) return;

    const pageName = pageNameFromPath(pathname);
    if (!pageName) return;

    // Reset on navigation
    mountTimeRef.current = performance.now();
    fetchPhases.current = new Map();
    trackedRef.current = pathname;

    // Use PerformanceObserver to track fetch/XHR requests
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            const res = entry as PerformanceResourceTiming;
            const label = labelForUrl(res.name);
            if (label) {
              const duration = res.responseEnd - res.fetchStart;
              const existing = fetchPhases.current.get(label) || 0;
              // Keep the longest fetch for each label (parallel fetches)
              fetchPhases.current.set(label, Math.max(existing, duration));
            }
          }
        }
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      // PerformanceObserver not supported
    }

    // Emit profiling data after a short settle period (page + data should be loaded)
    const emitProfiling = () => {
      if (trackedRef.current !== pathname) return;

      const totalMs = performance.now() - mountTimeRef.current;
      const phases = Array.from(fetchPhases.current.entries())
        .map(([name, ms]) => ({ name, ms }))
        .sort((a, b) => b.ms - a.ms); // Slowest first

      // Add render phase (time not spent on fetches)
      const fetchTotal = phases.reduce((s, p) => s + p.ms, 0);
      const renderMs = Math.max(totalMs - fetchTotal, 0);
      if (renderMs > 5) {
        phases.push({ name: 'Render', ms: renderMs });
      }

      if (phases.length > 0) {
        useProfilingStore.getState().setPageProfiling({
          phases,
          totalMs,
          pageName,
        });
      }
    };

    // Wait 1.5s for data fetches to complete, then emit
    timerRef.current = setTimeout(emitProfiling, 1500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (observer) observer.disconnect();
    };
  }, [pathname]);

  return null; // This component renders nothing
}
