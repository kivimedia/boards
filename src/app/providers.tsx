'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import KeyboardShortcutsProvider from '@/components/layout/KeyboardShortcutsProvider';
import ProfilingPopup from '@/components/profiling/ProfilingPopup';

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
          {children}
          <ProfilingPopup />
        </KeyboardShortcutsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
