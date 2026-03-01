'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import OffboardingWizard from '@/components/offboarding/OffboardingWizard';

function OffboardingContent() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') || undefined;

  return (
    <div className="p-6">
      <OffboardingWizard preselectedClientId={clientId} />
    </div>
  );
}

export default function OffboardingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-navy/40 dark:text-slate-500">Loading...</div>}>
      <OffboardingContent />
    </Suspense>
  );
}
