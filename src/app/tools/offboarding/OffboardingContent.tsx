'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import OffboardingWizard from '@/components/offboarding/OffboardingWizard';

function Inner() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') || undefined;
  return <OffboardingWizard preselectedClientId={clientId} />;
}

export default function OffboardingContent() {
  return (
    <Suspense fallback={<div className="text-navy/40 dark:text-slate-500">Loading...</div>}>
      <Inner />
    </Suspense>
  );
}
