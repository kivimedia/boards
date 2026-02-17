'use client';

import { useState, useEffect } from 'react';

interface IntegrationConfig {
  id: string;
  service: string;
  config: Record<string, unknown>;
  is_active: boolean;
  has_api_key: boolean;
  created_at: string;
  updated_at: string;
}

const SERVICES = [
  {
    id: 'instantly',
    name: 'Instantly.io',
    icon: '✉️',
    description: 'Cold email sequences, warmup, and reply tracking',
    configFields: [
      { key: 'sender_email', label: 'Sender Email', type: 'email', placeholder: 'podcast@kivimedia.com' },
      { key: 'daily_limit', label: 'Daily Send Limit', type: 'number', placeholder: '20' },
      { key: 'warmup_enabled', label: 'Warmup Enabled', type: 'checkbox' },
    ],
    webhookUrl: '/api/podcast/webhooks/instantly',
  },
  {
    id: 'hunter',
    name: 'Hunter.io',
    icon: '🔍',
    description: 'Email discovery from name + domain (primary)',
    configFields: [],
    docsUrl: 'https://hunter.io/api',
  },
  {
    id: 'snov',
    name: 'Snov.io',
    icon: '📧',
    description: 'Email discovery fallback (format: client_id:client_secret)',
    configFields: [],
    docsUrl: 'https://snov.io/api',
  },
  {
    id: 'calendly',
    name: 'Cal.com / Calendly',
    icon: '📅',
    description: 'Booking webhook -- auto-updates candidates to "Scheduled"',
    configFields: [
      { key: 'scheduling_link', label: 'Scheduling Link', type: 'url', placeholder: 'https://kivimedia.com/15' },
      { key: 'webhook_secret', label: 'Webhook Secret (optional)', type: 'password', placeholder: 'webhook-signing-secret' },
    ],
    webhookUrl: '/api/podcast/webhooks/calendly',
  },
  {
    id: 'scout_config',
    name: 'Scout Pipeline',
    icon: '🔍',
    description: 'Default settings for LinkedIn Scout Pipeline (query, location, tools)',
    configFields: [
      { key: 'default_query', label: 'Default Search Query', type: 'text', placeholder: 'vibe coding freelancer agency AI tools' },
      { key: 'default_location', label: 'Default Location', type: 'text', placeholder: 'US' },
      { key: 'tool_focus', label: 'Tool Focus', type: 'text', placeholder: 'Cursor, Lovable, Bolt, Replit, v0, Windsurf' },
      { key: 'max_results', label: 'Max Results per Run', type: 'number', placeholder: '10' },
    ],
  },
] as const;

export default function PodcastIntegrationSettings() {
  const [configs, setConfigs] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [configInputs, setConfigInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ service: string; ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/podcast/integrations');
      const json = await res.json();
      if (json.data) setConfigs(json.data);
    } catch (err) {
      console.error('Failed to fetch configs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getConfig = (serviceId: string) =>
    configs.find((c) => c.service === serviceId);

  const startEditing = (serviceId: string) => {
    const existing = getConfig(serviceId);
    setEditingService(serviceId);
    setApiKeyInput('');
    setConfigInputs(
      existing?.config
        ? Object.fromEntries(
            Object.entries(existing.config).map(([k, v]) => [k, String(v ?? '')])
          )
        : {}
    );
    setTestResult(null);
  };

  const saveConfig = async (serviceId: string) => {
    setSaving(true);
    try {
      const svcDef = SERVICES.find((s) => s.id === serviceId);
      const configObj: Record<string, unknown> = {};
      for (const field of svcDef?.configFields ?? []) {
        const val = configInputs[field.key];
        if (field.type === 'checkbox') {
          configObj[field.key] = val === 'true';
        } else if (field.type === 'number') {
          configObj[field.key] = val ? parseInt(val, 10) : undefined;
        } else if (val) {
          configObj[field.key] = val;
        }
      }

      const body: Record<string, unknown> = {
        service: serviceId,
        config: configObj,
        is_active: true,
      };

      if (apiKeyInput.trim()) {
        body.api_key = apiKeyInput.trim();
      }

      const res = await fetch('/api/podcast/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await fetchConfigs();
        setEditingService(null);
        setApiKeyInput('');
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (serviceId: string) => {
    setTesting(serviceId);
    setTestResult(null);
    try {
      const res = await fetch('/api/podcast/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceId }),
      });
      const json = await res.json();
      if (json.data?.success) {
        setTestResult({ service: serviceId, ok: true, message: json.data.message });
      } else {
        setTestResult({ service: serviceId, ok: false, message: json.error || 'Test failed' });
      }
    } catch (err: any) {
      setTestResult({ service: serviceId, ok: false, message: err.message });
    } finally {
      setTesting(null);
    }
  };

  const toggleActive = async (serviceId: string, active: boolean) => {
    await fetch('/api/podcast/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: serviceId, is_active: active }),
    });
    await fetchConfigs();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {SERVICES.map((svc) => {
        const config = getConfig(svc.id);
        const isEditing = editingService === svc.id;

        return (
          <div
            key={svc.id}
            className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4">
              <span className="text-2xl">{svc.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
                    {svc.name}
                  </span>
                  {config?.is_active && config.has_api_key && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-semibold uppercase">
                      Connected
                    </span>
                  )}
                  {config && !config.has_api_key && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-semibold uppercase">
                      No Key
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-navy/50 dark:text-slate-400 font-body">
                  {svc.description}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {config?.has_api_key && (
                  <button
                    onClick={() => testConnection(svc.id)}
                    disabled={testing === svc.id}
                    className="text-[11px] px-2.5 py-1 rounded bg-navy/5 dark:bg-slate-700 text-navy/60 dark:text-slate-400 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                  >
                    {testing === svc.id ? 'Testing...' : 'Test'}
                  </button>
                )}
                {config?.is_active && config.has_api_key && (
                  <button
                    onClick={() => toggleActive(svc.id, false)}
                    className="text-[11px] px-2.5 py-1 rounded bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    Disable
                  </button>
                )}
                <button
                  onClick={() => (isEditing ? setEditingService(null) : startEditing(svc.id))}
                  className="text-[11px] px-2.5 py-1 rounded bg-electric/10 text-electric hover:bg-electric/20 transition-colors font-semibold"
                >
                  {isEditing ? 'Cancel' : config ? 'Edit' : 'Configure'}
                </button>
              </div>
            </div>

            {/* Test result */}
            {testResult && testResult.service === svc.id && (
              <div className={`px-4 py-2 text-xs font-body border-t ${
                testResult.ok
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/10 dark:text-green-300 border-green-100 dark:border-green-900/20'
                  : 'bg-red-50 text-red-700 dark:bg-red-900/10 dark:text-red-300 border-red-100 dark:border-red-900/20'
              }`}>
                {testResult.ok ? '✓' : '✕'} {testResult.message}
              </div>
            )}

            {/* Webhook URL info */}
            {config?.is_active && 'webhookUrl' in svc && (
              <div className="px-4 py-2 border-t border-navy/5 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                  Webhook URL:{' '}
                  <code className="bg-navy/5 dark:bg-slate-700 px-1 py-0.5 rounded text-navy/60 dark:text-slate-400">
                    {typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.com'}
                    {svc.webhookUrl}
                  </code>
                </div>
              </div>
            )}

            {/* Edit form */}
            {isEditing && (
              <div className="border-t border-navy/5 dark:border-slate-700 p-4 space-y-3 bg-cream/30 dark:bg-slate-800/50">
                {/* API Key */}
                <div>
                  <label className="block text-[11px] font-semibold text-navy/60 dark:text-slate-400 mb-1 font-heading">
                    API Key {config?.has_api_key && '(leave blank to keep current)'}
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={config?.has_api_key ? '••••••••' : 'Enter API key'}
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-navy dark:text-slate-200 placeholder:text-navy/30 dark:placeholder:text-slate-500 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                  />
                  {svc.id === 'snov' && (
                    <p className="text-[10px] text-navy/40 dark:text-slate-500 mt-1 font-body">
                      Format: client_id:client_secret
                    </p>
                  )}
                </div>

                {/* Service-specific config fields */}
                {svc.configFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[11px] font-semibold text-navy/60 dark:text-slate-400 mb-1 font-heading">
                      {field.label}
                    </label>
                    {field.type === 'checkbox' ? (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={configInputs[field.key] === 'true'}
                          onChange={(e) =>
                            setConfigInputs((prev) => ({
                              ...prev,
                              [field.key]: e.target.checked ? 'true' : 'false',
                            }))
                          }
                          className="rounded border-navy/20 dark:border-slate-500 text-electric focus:ring-electric"
                        />
                        <span className="text-xs text-navy/60 dark:text-slate-400 font-body">
                          Enable
                        </span>
                      </label>
                    ) : (
                      <input
                        type={field.type}
                        value={configInputs[field.key] ?? ''}
                        onChange={(e) =>
                          setConfigInputs((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-navy dark:text-slate-200 placeholder:text-navy/30 dark:placeholder:text-slate-500 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                      />
                    )}
                  </div>
                ))}

                {/* Save button */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => saveConfig(svc.id)}
                    disabled={saving}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingService(null)}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-navy/5 dark:bg-slate-700 text-navy/60 dark:text-slate-400 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
