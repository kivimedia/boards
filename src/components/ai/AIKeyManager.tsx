'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AIProvider, AIApiKey } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const PROVIDERS: { value: AIProvider; label: string; description: string; keyUrl: string }[] = [
  { value: 'anthropic', label: 'Anthropic', description: 'Claude models', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { value: 'openai', label: 'OpenAI', description: 'GPT & Sora models', keyUrl: 'https://platform.openai.com/api-keys' },
  { value: 'google', label: 'Google', description: 'Gemini models', keyUrl: 'https://aistudio.google.com/apikey' },
];

function maskKey(key: string): string {
  if (!key || key.length < 8) return '********';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

export default function AIKeyManager() {
  const [keys, setKeys] = useState<AIApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Add key state
  const [showAddKey, setShowAddKey] = useState(false);
  const [addProvider, setAddProvider] = useState<AIProvider>('anthropic');
  const [addLabel, setAddLabel] = useState('');

  const getDefaultLabel = (provider: AIProvider) => {
    const providerLabel = PROVIDERS.find((p) => p.value === provider)?.label || provider;
    const existing = keys.filter((k) => k.provider === provider).length;
    return `${providerLabel} Key ${existing + 1}`;
  };
  const [addKeyValue, setAddKeyValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Test key state
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);

  // Delete confirmation
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/keys');
      const json = await res.json();
      if (json.data) {
        setKeys(json.data);
      }
    } catch {
      showToast('error', 'Failed to load API keys.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleAddKey = async () => {
    if (!addKeyValue.trim() || !addLabel.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/ai/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: addProvider,
          label: addLabel.trim(),
          key: addKeyValue.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add key');
      }
      showToast('success', `API key for ${addProvider} added successfully.`);
      setShowAddKey(false);
      setAddProvider('anthropic');
      setAddLabel('');
      setAddKeyValue('');
      await fetchKeys();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to add key.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestKey = async (keyId: string) => {
    setTestingKeyId(keyId);
    try {
      const res = await fetch(`/api/ai/keys/${keyId}/test`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.valid) {
        showToast('success', json.message);
      } else {
        showToast('error', json.message || 'API key test failed.');
      }
    } catch {
      showToast('error', 'Failed to test API key.');
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleDeleteKey = async () => {
    if (!deleteKeyId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/ai/keys/${deleteKeyId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete key');
      }
      setKeys((prev) => prev.filter((k) => k.id !== deleteKeyId));
      showToast('success', 'API key deleted.');
      setDeleteKeyId(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete key.');
    } finally {
      setDeleting(false);
    }
  };

  const getProviderLabel = (provider: AIProvider) => {
    return PROVIDERS.find((p) => p.value === provider)?.label || provider;
  };

  const getProviderStatus = (provider: AIProvider) => {
    const providerKeys = keys.filter((k) => k.provider === provider && k.is_active);
    return providerKeys.length > 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading API keys...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
            animate-in fade-in slide-in-from-top-2 duration-200
            ${toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
            }
          `}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Provider Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PROVIDERS.map((provider) => {
          const configured = getProviderStatus(provider.value);
          const providerKeys = keys.filter((k) => k.provider === provider.value);
          return (
            <div
              key={provider.value}
              className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-3 h-3 rounded-full ${configured ? 'bg-green-500' : 'bg-navy/20'}`} />
                <h4 className="text-navy dark:text-slate-100 font-heading font-semibold text-sm">
                  {provider.label}
                </h4>
              </div>
              <p className="text-navy/50 dark:text-slate-400 font-body text-xs mb-2">{provider.description}</p>
              <p className="text-navy/70 dark:text-slate-300 font-body text-xs">
                {providerKeys.length === 0
                  ? 'Not configured'
                  : `${providerKeys.filter((k) => k.is_active).length} active key${providerKeys.filter((k) => k.is_active).length !== 1 ? 's' : ''}`}
              </p>
            </div>
          );
        })}
      </div>

      {/* Keys List */}
      <div className="flex items-center justify-between">
        <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">API Keys</h3>
        <Button variant="primary" size="sm" onClick={() => { setAddProvider('anthropic'); setAddLabel(getDefaultLabel('anthropic')); setAddKeyValue(''); setShowAddKey(true); }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Key
        </Button>
      </div>

      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        {keys.length === 0 ? (
          <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
            No API keys configured. Add a key to get started with AI features.
          </div>
        ) : (
          <div className="divide-y divide-cream-dark dark:divide-slate-700">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${key.is_active ? 'bg-green-500' : 'bg-navy/20'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                      {key.label}
                    </p>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-electric/10 text-electric border border-electric/20">
                      {getProviderLabel(key.provider)}
                    </span>
                  </div>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5 font-mono">
                    {maskKey(key.key_encrypted)}
                  </p>
                  {key.last_used_at && (
                    <p className="text-xs text-navy/30 dark:text-slate-500 font-body mt-0.5">
                      Last used: {new Date(key.last_used_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={testingKeyId === key.id}
                    onClick={() => handleTestKey(key.id)}
                  >
                    Test
                  </Button>
                  <button
                    onClick={() => setDeleteKeyId(key.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Delete key"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Key Modal */}
      <Modal
        isOpen={showAddKey}
        onClose={() => {
          setShowAddKey(false);
          setAddProvider('anthropic');
          setAddLabel('');
          setAddKeyValue('');
        }}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-4">
            Add API Key
          </h3>
          <p className="text-navy/50 font-body text-sm mb-6">
            Add a new API key for an AI provider. Keys are encrypted at rest.
          </p>

          {/* Provider */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
              Provider
            </label>
            <div className="relative">
              <select
                value={addProvider}
                onChange={(e) => { const p = e.target.value as AIProvider; setAddProvider(p); setAddLabel(getDefaultLabel(p)); }}
                className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            <a
              href={PROVIDERS.find((p) => p.value === addProvider)?.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-xs text-electric hover:text-electric/80 font-body transition-colors"
            >
              Get your {PROVIDERS.find((p) => p.value === addProvider)?.label} API key
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>

          {/* Label */}
          <div className="mb-4">
            <Input
              label="Label"
              placeholder="e.g., Production Key"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
            />
          </div>

          {/* Key */}
          <div className="mb-6">
            <Input
              label="API Key"
              type="password"
              placeholder="sk-..."
              value={addKeyValue}
              onChange={(e) => setAddKeyValue(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setShowAddKey(false);
                setAddProvider('anthropic');
                setAddLabel('');
                setAddKeyValue('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={!addLabel.trim() || !addKeyValue.trim()}
              onClick={handleAddKey}
            >
              Save Key
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteKeyId}
        onClose={() => setDeleteKeyId(null)}
        size="sm"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-2">
            Delete API Key
          </h3>
          <p className="text-navy/60 dark:text-slate-400 font-body text-sm mb-6">
            Are you sure you want to delete this API key? Any AI features using this key will stop working until a new key is configured.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setDeleteKeyId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={deleting}
              onClick={handleDeleteKey}
            >
              Delete Key
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
