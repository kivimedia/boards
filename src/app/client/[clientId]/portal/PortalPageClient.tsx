'use client';

import { useState, useCallback } from 'react';
import ClientPortalKanban from '@/components/client/ClientPortalKanban';
import ClientTicketSubmit from '@/components/client/ClientTicketSubmit';
import ClientSatisfaction from '@/components/client/ClientSatisfaction';

interface PortalPageClientProps {
  clientId: string;
  clientName: string;
}

type PortalTab = 'board' | 'submit' | 'satisfaction';

const TABS: { key: PortalTab; label: string; icon: string }[] = [
  {
    key: 'board',
    label: 'Board',
    icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2',
  },
  {
    key: 'submit',
    label: 'Submit Ticket',
    icon: 'M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    key: 'satisfaction',
    label: 'Feedback',
    icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
];

export default function PortalPageClient({ clientId, clientName }: PortalPageClientProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>('board');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTicketSubmit = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setActiveTab('board');
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-cream">
      {/* Tab Navigation */}
      <div className="border-b border-cream-dark bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6">
          <nav className="flex gap-1 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium font-body border-b-2 transition-all duration-200
                  ${activeTab === tab.key
                    ? 'border-electric text-electric'
                    : 'border-transparent text-navy/40 hover:text-navy/60 hover:border-cream-dark'
                  }
                `}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'board' && (
          <ClientPortalKanban key={refreshKey} clientId={clientId} />
        )}

        {activeTab === 'submit' && (
          <div className="max-w-2xl">
            <ClientTicketSubmit clientId={clientId} onSubmit={handleTicketSubmit} />
          </div>
        )}

        {activeTab === 'satisfaction' && (
          <div className="max-w-lg">
            <ClientSatisfaction clientId={clientId} />
          </div>
        )}
      </div>
    </div>
  );
}
