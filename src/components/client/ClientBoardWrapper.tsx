'use client';

import { useState } from 'react';
import ClientOnboarding from './ClientOnboarding';

interface ClientBoardWrapperProps {
  userId: string;
  displayName: string;
  needsOnboarding: boolean;
  children: React.ReactNode;
}

export default function ClientBoardWrapper({
  userId,
  displayName,
  needsOnboarding,
  children,
}: ClientBoardWrapperProps) {
  const [showOnboarding, setShowOnboarding] = useState(needsOnboarding);

  if (showOnboarding) {
    return (
      <ClientOnboarding
        userId={userId}
        displayName={displayName}
        onComplete={() => setShowOnboarding(false)}
      />
    );
  }

  return <>{children}</>;
}
