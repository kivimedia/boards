'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ApiKey, ApiKeyPermission } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const ALL_PERMISSIONS: { value: ApiKeyPermission; label: string; group: string }[] = [
  { value: 'boards:read', label: 'Read Boards', group: 'Boards' },
  { value: 'boards:write', label: 'Write Boards', group: 'Boards' },
  { value: 'cards:read', label: 'Read Cards', group: 'Cards' },
  { value: 'cards:write', label: 'Write Cards', group: 'Cards' },
  { value: 'comments:read', label: 'Read Comments', group: 'Comments' },
  { value: 'comments:write', label: 'Write Comments', group: 'Comments' },
  { value: 'labels:read', label: 'Read Labels', group: 'Labels' },
  { value: 'labels:write', label: 'Write Labels', group: 'Labels' },
  { value: 'webhooks:manage', label: 'Manage Webhooks', group: 'Webhooks' },
  { value: 'users:read', label: 'Read Users', group: 'Users' },
  { value: 'pageforge:read', label: 'Read PageForge', group: 'PageForge' },
  { value: 'pageforge:write', label: 'Write PageForge', group: 'PageForge' },
];

export default function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Create key state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPermissions, setCreatePermissions] = useState<ApiKeyPermission[]>([]);
  const [createRateMinute, setCreateRateMinute] = useState('60');
  const [createRateDay, setCreateRateDay] = useState('10000');
  const [saving, setSaving] = useState(false);

  // Raw key display state
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [rawKeyCopied, setRawKeyCopied] = useState(false);

  // Delete / revoke state
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/keys');
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

  const togglePermission = (perm: ApiKeyPermission) => {
    setCreatePermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleCreate = async () => {
    if (!createName.trim() || createPermissions.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          permissions: createPermissions,
          rate_limit_per_minute: parseInt(createRateMinute, 10) || 60,
          rate_limit_per_day: parseInt(createRateDay, 10) || 10000,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create key');
      }
      const json = await res.json();
      setRawKey(json.data.raw_key);
      setShowCreate(false);
      setCreateName('');
      setCreatePermissions([]);
      setCreateRateMinute('60');
      setCreateRateDay('10000');
      await fetchKeys();
      showToast('success', 'API key created successfully.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create key.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!deleteKeyId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/keys/${deleteKeyId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete key');
      }
      setKeys((prev) => prev.filter((k) => k.id !== deleteKeyId));
      setDeleteKeyId(null);
      showToast('success', 'API key revoked and deleted.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to revoke key.');
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setRawKeyCopied(true);
      setTimeout(() => setRawKeyCopied(false), 2000);
    } catch {
      showToast('error', 'Failed to copy to clipboard.');
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return 'Never';
    return new Date(d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">API Keys</h3>
          <p className="text-navy/50 dark:text-slate-400 font-body text-sm mt-0.5">
            Manage API keys for external integrations.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Key
        </Button>
      </div>

      {/* Keys List */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        {keys.length === 0 ? (
          <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
            No API keys yet. Create one to enable external integrations.
          </div>
        ) : (
          <div className="divide-y divide-cream-dark dark:divide-slate-700">
            {keys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${key.is_active ? 'bg-green-500' : 'bg-navy/20 dark:bg-slate-700'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                      {key.name}
                    </p>
                    <span className="font-mono text-xs text-navy/40 dark:text-slate-500 bg-cream-dark dark:bg-slate-800 px-2 py-0.5 rounded">
                      {key.key_prefix}...
                    </span>
                    {!key.is_active && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                      Created: {formatDate(key.created_at)}
                    </span>
                    <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                      Last used: {formatDate(key.last_used_at)}
                    </span>
                  </div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {key.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-electric/10 text-electric border border-electric/20"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setDeleteKeyId(key.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Revoke and delete"
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

      {/* Create Key Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false);
          setCreateName('');
          setCreatePermissions([]);
          setCreateRateMinute('60');
          setCreateRateDay('10000');
        }}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-2">
            Create API Key
          </h3>
          <p className="text-navy/50 dark:text-slate-400 font-body text-sm mb-6">
            Create a new key for external API access. The key will only be shown once.
          </p>

          <div className="mb-4">
            <Input
              label="Key Name"
              placeholder="e.g., Production Integration"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
          </div>

          {/* Permissions */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-2 font-body">
              Permissions
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_PERMISSIONS.map((perm) => (
                <label
                  key={perm.value}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-colors
                    ${createPermissions.includes(perm.value)
                      ? 'border-electric bg-electric/5'
                      : 'border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-600'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={createPermissions.includes(perm.value)}
                    onChange={() => togglePermission(perm.value)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    createPermissions.includes(perm.value)
                      ? 'border-electric bg-electric'
                      : 'border-navy/20 dark:border-slate-600'
                  }`}>
                    {createPermissions.includes(perm.value) && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-navy dark:text-slate-100 font-body">{perm.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Rate Limits */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Input
              label="Rate Limit (per minute)"
              type="number"
              value={createRateMinute}
              onChange={(e) => setCreateRateMinute(e.target.value)}
            />
            <Input
              label="Rate Limit (per day)"
              type="number"
              value={createRateDay}
              onChange={(e) => setCreateRateDay(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={!createName.trim() || createPermissions.length === 0}
              onClick={handleCreate}
            >
              Create Key
            </Button>
          </div>
        </div>
      </Modal>

      {/* Raw Key Display Modal */}
      <Modal
        isOpen={!!rawKey}
        onClose={() => { setRawKey(null); setRawKeyCopied(false); }}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-2">
            API Key Created
          </h3>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 mt-0.5 shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-amber-800 font-body text-sm">
                Copy this key now. It will not be shown again. Store it securely.
              </p>
            </div>
          </div>
          <div className="bg-navy/5 dark:bg-slate-800 rounded-xl p-4 font-mono text-sm text-navy dark:text-slate-100 break-all border border-navy/10 dark:border-slate-700">
            {rawKey}
          </div>
          <div className="flex items-center justify-end gap-3 mt-4">
            <Button
              variant="secondary"
              size="md"
              onClick={() => rawKey && copyToClipboard(rawKey)}
            >
              {rawKeyCopied ? 'Copied!' : 'Copy Key'}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => { setRawKey(null); setRawKeyCopied(false); }}
            >
              Done
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
            Revoke API Key
          </h3>
          <p className="text-navy/60 dark:text-slate-400 font-body text-sm mb-6">
            Are you sure you want to revoke and delete this API key? Any integrations using this key will immediately stop working.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setDeleteKeyId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={deleting}
              onClick={handleRevoke}
            >
              Revoke Key
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
