'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SSOConfig, SSOProviderType } from '@/lib/types';

const PROVIDER_OPTIONS: { value: SSOProviderType; label: string }[] = [
  { value: 'saml', label: 'SAML' },
  { value: 'oidc', label: 'OIDC' },
];

const ROLE_OPTIONS = ['admin', 'department_lead', 'member', 'guest'];

interface SSOFormState {
  provider_type: SSOProviderType;
  name: string;
  issuer_url: string;
  metadata_url: string;
  client_id: string;
  allowed_domains: string;
  auto_provision_users: boolean;
  default_role: string;
}

const EMPTY_FORM: SSOFormState = {
  provider_type: 'saml',
  name: '',
  issuer_url: '',
  metadata_url: '',
  client_id: '',
  allowed_domains: '',
  auto_provision_users: false,
  default_role: 'member',
};

export default function SSOConfigManager() {
  const [configs, setConfigs] = useState<SSOConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SSOFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/enterprise/sso');
      const json = await res.json();
      if (json.data) setConfigs(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (config: SSOConfig) => {
    setEditingId(config.id);
    setForm({
      provider_type: config.provider_type,
      name: config.name,
      issuer_url: config.issuer_url ?? '',
      metadata_url: config.metadata_url ?? '',
      client_id: config.client_id ?? '',
      allowed_domains: (config.allowed_domains ?? []).join(', '),
      auto_provision_users: config.auto_provision_users,
      default_role: config.default_role,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      provider_type: form.provider_type,
      name: form.name.trim(),
      issuer_url: form.issuer_url.trim() || undefined,
      metadata_url: form.metadata_url.trim() || undefined,
      client_id: form.client_id.trim() || undefined,
      allowed_domains: form.allowed_domains
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean),
      auto_provision_users: form.auto_provision_users,
      default_role: form.default_role,
    };

    try {
      if (editingId) {
        const res = await fetch(`/api/enterprise/sso/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.data) {
          setConfigs((prev) => prev.map((c) => (c.id === editingId ? json.data : c)));
        }
      } else {
        const res = await fetch('/api/enterprise/sso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.data) {
          setConfigs((prev) => [json.data, ...prev]);
        }
      }
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (config: SSOConfig) => {
    const res = await fetch(`/api/enterprise/sso/${config.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !config.is_active }),
    });
    const json = await res.json();
    if (json.data) {
      setConfigs((prev) => prev.map((c) => (c.id === config.id ? json.data : c)));
    }
  };

  const handleDelete = async (configId: string) => {
    if (!confirm('Delete this SSO configuration?')) return;

    await fetch(`/api/enterprise/sso/${configId}`, { method: 'DELETE' });
    setConfigs((prev) => prev.filter((c) => c.id !== configId));
  };

  if (loading) {
    return <div className="text-navy/50 dark:text-slate-400 font-body py-8 text-center">Loading SSO configurations...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">SSO Configurations</h3>
          <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-1">
            Manage SAML and OIDC identity providers for single sign-on.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
            className="px-4 py-2 bg-electric text-white rounded-lg text-sm font-body hover:bg-electric/90 transition-colors"
          >
            Add SSO Provider
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-cream dark:bg-navy rounded-xl border border-cream-dark dark:border-slate-700 p-6 space-y-4">
          <h4 className="text-sm font-bold text-navy dark:text-slate-100 font-heading">
            {editingId ? 'Edit SSO Configuration' : 'New SSO Configuration'}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-body text-navy/70 dark:text-slate-300 mb-1">Provider Type</label>
              <select
                value={form.provider_type}
                onChange={(e) => setForm((f) => ({ ...f, provider_type: e.target.value as SSOProviderType }))}
                className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 bg-white dark:bg-dark-surface"
              >
                {PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-body text-navy/70 dark:text-slate-300 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Company Okta"
                className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 dark:bg-dark-surface dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-body text-navy/70 dark:text-slate-300 mb-1">Issuer URL</label>
              <input
                type="url"
                value={form.issuer_url}
                onChange={(e) => setForm((f) => ({ ...f, issuer_url: e.target.value }))}
                placeholder="https://idp.example.com"
                className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 dark:bg-dark-surface dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-body text-navy/70 dark:text-slate-300 mb-1">Metadata URL</label>
              <input
                type="url"
                value={form.metadata_url}
                onChange={(e) => setForm((f) => ({ ...f, metadata_url: e.target.value }))}
                placeholder="https://idp.example.com/.well-known"
                className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 dark:bg-dark-surface dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-body text-navy/70 dark:text-slate-300 mb-1">Client ID</label>
              <input
                type="text"
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                placeholder="Client ID from provider"
                className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 dark:bg-dark-surface dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-body text-navy/70 dark:text-slate-300 mb-1">Allowed Domains (comma-separated)</label>
              <input
                type="text"
                value={form.allowed_domains}
                onChange={(e) => setForm((f) => ({ ...f, allowed_domains: e.target.value }))}
                placeholder="example.com, corp.example.com"
                className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 dark:bg-dark-surface dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-body text-navy/70 dark:text-slate-300 mb-1">Default Role</label>
              <select
                value={form.default_role}
                onChange={(e) => setForm((f) => ({ ...f, default_role: e.target.value }))}
                className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 bg-white dark:bg-dark-surface"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="auto_provision"
                checked={form.auto_provision_users}
                onChange={(e) => setForm((f) => ({ ...f, auto_provision_users: e.target.checked }))}
                className="rounded border-cream-dark"
              />
              <label htmlFor="auto_provision" className="text-sm font-body text-navy dark:text-slate-100">
                Auto-provision users
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-electric text-white rounded-lg text-sm font-body hover:bg-electric/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-cream-dark dark:bg-slate-800 text-navy dark:text-slate-100 rounded-lg text-sm font-body hover:bg-cream-dark/80 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {configs.length === 0 && !showForm ? (
        <div className="text-center py-12 text-navy/40 dark:text-slate-500 font-body">
          No SSO configurations yet. Add one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <div
              key={config.id}
              className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-electric/10 text-electric text-xs font-bold font-heading uppercase">
                  {config.provider_type}
                </span>
                <div>
                  <h4 className="text-sm font-bold text-navy dark:text-slate-100 font-heading">{config.name}</h4>
                  <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
                    {config.allowed_domains.length > 0
                      ? config.allowed_domains.join(', ')
                      : 'No domain restrictions'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-body px-2 py-1 rounded-full ${
                    config.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {config.is_active ? 'Active' : 'Inactive'}
                </span>

                <button
                  onClick={() => handleToggle(config)}
                  className="text-xs text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 font-body transition-colors"
                >
                  {config.is_active ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => startEdit(config)}
                  className="text-xs text-electric hover:text-electric/80 font-body transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(config.id)}
                  className="text-xs text-red-500 hover:text-red-700 font-body transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
