'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import KeyboardShortcutsProvider from '@/components/layout/KeyboardShortcutsProvider';
import ProfilingPopup from '@/components/profiling/ProfilingPopup';
import PageProfiler from '@/components/profiling/PageProfiler';
import MeetingPrepProvider from '@/components/meeting-prep/MeetingPrepProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <KeyboardShortcutsProvider>
          <MeetingPrepProvider>
            {children}
          </MeetingPrepProvider>
          <PageProfiler />
          <ProfilingPopup />
        </KeyboardShortcutsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
