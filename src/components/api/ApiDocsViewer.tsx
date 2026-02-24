'use client';

import { useState, useEffect } from 'react';

interface Endpoint {
  method: string;
  path: string;
  description: string;
  auth: string;
  body?: string;
  query?: string;
}

interface WebhookEventDoc {
  event: string;
  description: string;
}

interface PermissionScope {
  scope: string;
  description: string;
}

interface ApiDocs {
  title: string;
  version: string;
  base_url: string;
  authentication: { description: string; header: string };
  endpoints: Endpoint[];
  webhook_events: WebhookEventDoc[];
  permission_scopes: PermissionScope[];
  rate_limiting: {
    description: string;
    headers: Record<string, string>;
  };
  webhook_delivery: {
    description: string;
    headers: Record<string, string>;
    retry_policy: string;
    timeout: string;
  };
  code_examples: Record<string, string>;
}

export default function ApiDocsViewer() {
  const [docs, setDocs] = useState<ApiDocs | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'endpoints' | 'webhooks' | 'permissions' | 'examples'>('endpoints');

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const res = await fetch('/api/v1/docs');
        const json = await res.json();
        if (json.data) {
          setDocs(json.data);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    fetchDocs();
  }, []);

  const methodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-green-100 text-green-700 border-green-200';
      case 'POST': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'PATCH': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'PUT': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'DELETE': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading documentation...
        </div>
      </div>
    );
  }

  if (!docs) {
    return (
      <div className="text-center text-navy/40 dark:text-slate-500 font-body text-sm py-12">
        Failed to load API documentation.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">{docs.title}</h3>
        <p className="text-navy/50 dark:text-slate-400 font-body text-sm mt-0.5">
          Version {docs.version} | Base URL: <code className="font-mono text-electric">{docs.base_url}</code>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-cream-dark dark:bg-slate-800 rounded-xl p-1">
        {[
          { key: 'endpoints', label: 'Endpoints' },
          { key: 'webhooks', label: 'Webhook Events' },
          { key: 'permissions', label: 'Permissions' },
          { key: 'examples', label: 'Code Examples' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`
              flex-1 px-4 py-2 rounded-lg text-sm font-body font-medium transition-colors
              ${activeTab === tab.key
                ? 'bg-white dark:bg-dark-surface text-navy dark:text-slate-100 shadow-sm'
                : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Endpoints Tab */}
      {activeTab === 'endpoints' && (
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
          <div className="divide-y divide-cream-dark dark:divide-slate-700">
            {docs.endpoints.map((endpoint, i) => (
              <div key={i} className="px-6 py-4">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${methodColor(endpoint.method)}`}>
                    {endpoint.method}
                  </span>
                  <code className="text-sm text-navy dark:text-slate-100 font-mono">{endpoint.path}</code>
                  {endpoint.auth !== 'None' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-body">
                      {endpoint.auth}
                    </span>
                  )}
                </div>
                <p className="text-sm text-navy/60 dark:text-slate-400 font-body">{endpoint.description}</p>
                {endpoint.body && (
                  <div className="mt-2">
                    <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body uppercase tracking-wider">Body:</span>
                    <code className="block text-xs text-navy/70 dark:text-slate-300 font-mono mt-0.5 bg-cream/50 dark:bg-navy/50 rounded px-2 py-1">
                      {endpoint.body}
                    </code>
                  </div>
                )}
                {endpoint.query && (
                  <div className="mt-2">
                    <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body uppercase tracking-wider">Query:</span>
                    <code className="block text-xs text-navy/70 dark:text-slate-300 font-mono mt-0.5 bg-cream/50 dark:bg-navy/50 rounded px-2 py-1">
                      {endpoint.query}
                    </code>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Rate Limiting Info */}
          <div className="px-6 py-4 bg-cream/30 dark:bg-navy/30 border-t border-cream-dark dark:border-slate-700">
            <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-body mb-2">Rate Limiting</h4>
            <p className="text-sm text-navy/60 dark:text-slate-400 font-body mb-2">{docs.rate_limiting.description}</p>
            <div className="space-y-1">
              {Object.entries(docs.rate_limiting.headers).map(([header, desc]) => (
                <div key={header} className="flex gap-2">
                  <code className="text-xs font-mono text-electric shrink-0">{header}</code>
                  <span className="text-xs text-navy/50 dark:text-slate-400 font-body">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Webhook Events Tab */}
      {activeTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
            <div className="divide-y divide-cream-dark dark:divide-slate-700">
              {docs.webhook_events.map((event) => (
                <div key={event.event} className="px-6 py-3 flex items-center gap-4">
                  <code className="text-sm font-mono text-electric font-medium min-w-[160px]">{event.event}</code>
                  <span className="text-sm text-navy/60 dark:text-slate-400 font-body">{event.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery Info */}
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
            <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-body mb-2">Webhook Delivery</h4>
            <p className="text-sm text-navy/60 dark:text-slate-400 font-body mb-3">{docs.webhook_delivery.description}</p>
            <div className="space-y-1 mb-3">
              {Object.entries(docs.webhook_delivery.headers).map(([header, desc]) => (
                <div key={header} className="flex gap-2">
                  <code className="text-xs font-mono text-electric shrink-0">{header}</code>
                  <span className="text-xs text-navy/50 dark:text-slate-400 font-body">{desc}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-xs text-navy/50 dark:text-slate-400 font-body">
              <span>Retry policy: {docs.webhook_delivery.retry_policy}</span>
              <span>Timeout: {docs.webhook_delivery.timeout}</span>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Tab */}
      {activeTab === 'permissions' && (
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
          <div className="divide-y divide-cream-dark dark:divide-slate-700">
            {docs.permission_scopes.map((scope) => (
              <div key={scope.scope} className="px-6 py-3 flex items-center gap-4">
                <code className="text-sm font-mono text-electric font-medium min-w-[160px]">{scope.scope}</code>
                <span className="text-sm text-navy/60 dark:text-slate-400 font-body">{scope.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code Examples Tab */}
      {activeTab === 'examples' && (
        <div className="space-y-4">
          {Object.entries(docs.code_examples).map(([key, code]) => (
            <div key={key} className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
              <div className="px-6 py-3 bg-cream/30 dark:bg-navy/30 border-b border-cream-dark dark:border-slate-700">
                <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-body">
                  {key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </h4>
              </div>
              <pre className="px-6 py-4 text-xs text-navy dark:text-slate-100 font-mono overflow-auto max-h-64 leading-5">
                {code}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
