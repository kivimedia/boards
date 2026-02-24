'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Integration, IntegrationProvider } from '@/lib/types';

const PROVIDER_INFO: Record<IntegrationProvider, { label: string; description: string; icon: string }> = {
  slack: {
    label: 'Slack',
    description: 'Send board notifications to Slack channels',
    icon: '#',
  },
  github: {
    label: 'GitHub',
    description: 'Link PRs, issues, and branches to cards',
    icon: '</>',
  },
  figma: {
    label: 'Figma',
    description: 'Embed Figma designs directly in cards',
    icon: 'F',
  },
};

export default function IntegrationList() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingProvider, setConnectingProvider] = useState<IntegrationProvider | null>(null);
  const [newName, setNewName] = useState('');
  const [newWorkspaceId, setNewWorkspaceId] = useState('');
  const [showConnectForm, setShowConnectForm] = useState(false);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations');
      const json = await res.json();
      if (json.data) setIntegrations(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleConnect = async () => {
    if (!connectingProvider || !newName.trim()) return;

    const res = await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: connectingProvider,
        name: newName.trim(),
        workspace_id: newWorkspaceId.trim() || undefined,
      }),
    });

    const json = await res.json();
    if (json.data) {
      setIntegrations((prev) => [json.data, ...prev]);
      resetForm();
    }
  };

  const handleToggle = async (integration: Integration) => {
    const res = await fetch(`/api/integrations/${integration.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !integration.is_active }),
    });

    const json = await res.json();
    if (json.data) {
      setIntegrations((prev) =>
        prev.map((i) => (i.id === integration.id ? json.data : i))
      );
    }
  };

  const handleDisconnect = async (id: string) => {
    await fetch(`/api/integrations/${id}`, { method: 'DELETE' });
    setIntegrations((prev) => prev.filter((i) => i.id !== id));
  };

  const resetForm = () => {
    setShowConnectForm(false);
    setConnectingProvider(null);
    setNewName('');
    setNewWorkspaceId('');
  };

  const connectedProviders = new Set(integrations.map((i) => i.provider));

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-cream-dark/40 dark:bg-slate-800/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Available providers */}
      <div>
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-3">Available Integrations</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(PROVIDER_INFO) as IntegrationProvider[]).map((provider) => {
            const info = PROVIDER_INFO[provider];
            const isConnected = connectedProviders.has(provider);

            return (
              <div
                key={provider}
                className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-4 flex flex-col"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-electric/10 text-electric flex items-center justify-center font-mono text-sm font-bold">
                    {info.icon}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">{info.label}</h4>
                    {isConnected && (
                      <span className="text-xs text-green-600 font-body">Connected</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-navy/60 dark:text-slate-400 font-body mb-3 flex-1">{info.description}</p>
                {!isConnected ? (
                  <button
                    onClick={() => {
                      setConnectingProvider(provider);
                      setShowConnectForm(true);
                      setNewName(`${info.label} Integration`);
                    }}
                    className="w-full px-3 py-2 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors"
                  >
                    Connect
                  </button>
                ) : (
                  <span className="text-center text-xs text-navy/40 dark:text-slate-500 font-body py-2">
                    Manage below
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Connect form modal */}
      {showConnectForm && connectingProvider && (
        <div className="rounded-xl border border-electric/20 bg-electric/5 dark:bg-electric/10 p-4">
          <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-3">
            Connect {PROVIDER_INFO[connectingProvider].label}
          </h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Integration Name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                placeholder="My Slack Workspace"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                Workspace / Org ID (optional)
              </label>
              <input
                type="text"
                value={newWorkspaceId}
                onChange={(e) => setNewWorkspaceId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                placeholder="T01234567"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleConnect}
                className="px-4 py-2 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors"
              >
                Connect
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 rounded-lg text-xs font-medium font-body bg-cream-dark dark:bg-slate-800 text-navy/60 dark:text-slate-400 hover:bg-cream-dark/80 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connected integrations */}
      {integrations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-3">Connected Integrations</h3>
          <div className="space-y-3">
            {integrations.map((integration) => {
              const info = PROVIDER_INFO[integration.provider];
              return (
                <div
                  key={integration.id}
                  className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-electric/10 text-electric flex items-center justify-center font-mono text-sm font-bold">
                      {info.icon}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">{integration.name}</h4>
                      <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
                        {info.label}
                        {integration.workspace_id && ` - ${integration.workspace_id}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${integration.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                    />
                    <button
                      onClick={() => handleToggle(integration)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-cream-dark hover:bg-cream-dark/80 text-navy/60 transition-colors"
                    >
                      {integration.is_active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => handleDisconnect(integration.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
