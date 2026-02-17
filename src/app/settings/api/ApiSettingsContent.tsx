'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ApiKey } from '@/lib/types';
import ApiKeyManager from '@/components/api/ApiKeyManager';
import WebhookManager from '@/components/api/WebhookManager';
import WebhookDeliveryLog from '@/components/api/WebhookDeliveryLog';
import ApiUsageChart from '@/components/api/ApiUsageChart';
import ApiDocsViewer from '@/components/api/ApiDocsViewer';

type Tab = 'keys' | 'webhooks' | 'usage' | 'docs';

export default function ApiSettingsContent() {
  const [activeTab, setActiveTab] = useState<Tab>('keys');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/keys');
      const json = await res.json();
      if (json.data) {
        setApiKeys(json.data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  // Refetch keys when switching to usage tab
  useEffect(() => {
    if (activeTab === 'usage') {
      fetchApiKeys();
    }
  }, [activeTab, fetchApiKeys]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    {
      key: 'keys',
      label: 'API Keys',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
      ),
    },
    {
      key: 'webhooks',
      label: 'Webhooks',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
          <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
          <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8H12" />
        </svg>
      ),
    },
    {
      key: 'usage',
      label: 'Usage',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      key: 'docs',
      label: 'Documentation',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-cream">
      <div className="max-w-5xl mx-auto py-8 px-6">
        {/* Tab Navigation */}
        <div className="flex gap-1 bg-white rounded-2xl border-2 border-cream-dark p-1.5 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedWebhookId(null); }}
              className={`
                flex items-center gap-2 flex-1 px-4 py-2.5 rounded-xl text-sm font-body font-medium transition-all
                ${activeTab === tab.key
                  ? 'bg-electric text-white shadow-sm'
                  : 'text-navy/50 hover:text-navy hover:bg-cream-dark'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'keys' && <ApiKeyManager />}

        {activeTab === 'webhooks' && !selectedWebhookId && (
          <WebhookManager onSelectWebhook={(id) => setSelectedWebhookId(id)} />
        )}

        {activeTab === 'webhooks' && selectedWebhookId && (
          <WebhookDeliveryLog
            webhookId={selectedWebhookId}
            onBack={() => setSelectedWebhookId(null)}
          />
        )}

        {activeTab === 'usage' && <ApiUsageChart apiKeys={apiKeys} />}

        {activeTab === 'docs' && <ApiDocsViewer />}
      </div>
    </div>
  );
}
