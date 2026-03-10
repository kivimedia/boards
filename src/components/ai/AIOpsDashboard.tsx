'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import type {
  AIOpsDashboardData,
  AIVendorAccountInput,
  AIVendorCategory,
  AIVendorSourceType,
  AIOpsVendorView,
} from '@/lib/ai/ops-dashboard';

const CATEGORIES: AIVendorCategory[] = [
  'ai_subscription',
  'ai_api',
  'hosting',
  'database',
  'developer_tool',
  'monitoring',
  'other',
];

const SOURCE_TYPES: AIVendorSourceType[] = [
  'manual',
  'api_synced',
  'estimated',
  'email_derived',
  'browser_assisted',
];

type SyncConnection = NonNullable<AIOpsDashboardData['connections']>[number];
type SyncCapability = NonNullable<AIOpsDashboardData['capabilities']>[number];

type SyncForm = {
  provider_key: 'openai' | 'anthropic';
  label: string;
  secret: string;
  monthlyBudgetUsd: string;
  billingAnchorDay: string;
};

const DEFAULT_SYNC_LABELS: Record<SyncForm['provider_key'], string> = {
  openai: 'OpenAI admin',
  anthropic: 'Anthropic admin',
};

const emptyVendorForm: AIVendorAccountInput = {
  provider_name: '',
  product_type: '',
  category: 'ai_subscription',
  source_type: 'manual',
  plan_name: '',
  account_label: '',
  spend_current_period: null,
  budget_limit: null,
  remaining_budget: null,
  remaining_credits: null,
  estimated_remaining_capacity: null,
  renewal_at: '',
  provider_url: '',
  notes: '',
  no_overage_allowed: false,
};

const emptySyncForm: SyncForm = {
  provider_key: 'openai',
  label: DEFAULT_SYNC_LABELS.openai,
  secret: '',
  monthlyBudgetUsd: '',
  billingAnchorDay: '',
};

const ADMIN_KEY_LINKS: Record<SyncForm['provider_key'], { href: string; label: string; hint: string }> = {
  openai: {
    href: 'https://platform.openai.com/settings/organization/admin-keys',
    label: 'Create OpenAI admin key',
    hint: 'Requires Organization Owner access.',
  },
  anthropic: {
    href: 'https://platform.claude.com/settings/admin-keys',
    label: 'Open Anthropic admin keys',
    hint: 'Requires an organization admin role and an org account, not an individual account.',
  },
};

function formatMoney(value: number | null | undefined) {
  if (value == null) return 'Unknown';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactNumber(value: number | null | undefined) {
  if (value == null) return 'Unknown';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString();
}

function badgeClass(status: AIOpsVendorView['status']) {
  if (status === 'healthy' || status === 'renewed_recently') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20';
  if (status === 'nearing_limit' || status === 'manual_update_needed') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20';
  if (status === 'exhausted') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20';
  return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
}

function severityClass(severity: 'info' | 'warning' | 'critical') {
  if (severity === 'critical') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20';
  if (severity === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20';
  return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20';
}

function syncModeBadge(mode: SyncCapability['syncMode']) {
  if (mode === 'live_admin') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20';
  if (mode === 'app_usage') return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20';
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20';
}

function connectionStatusBadge(status: SyncConnection['last_sync_status']) {
  if (status === 'ok') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20';
  if (status === 'error') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20';
  if (status === 'warning') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20';
  return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
}

export default function AIOpsDashboard() {
  const [data, setData] = useState<AIOpsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingVendor, setSavingVendor] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [vendorForm, setVendorForm] = useState<AIVendorAccountInput>(emptyVendorForm);
  const [connectionForm, setConnectionForm] = useState<SyncForm>(emptySyncForm);
  const [syncMessage, setSyncMessage] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/ops-dashboard');
      const json = await res.json();
      if (!res.ok || !json.data) {
        throw new Error(json.error || 'Failed to load AI ops dashboard');
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI ops dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const vendors = data?.vendors ?? [];
  const connections = data?.connections ?? [];
  const capabilities = data?.capabilities ?? [];
  const openAiConnection = connections.find((connection) => connection.provider_key === 'openai' && connection.is_active) ?? null;
  const anthropicConnection = connections.find((connection) => connection.provider_key === 'anthropic' && connection.is_active) ?? null;
  const selectedProviderConnection =
    connections.find((connection) => connection.provider_key === connectionForm.provider_key && connection.is_active) ?? null;
  const selectedAdminKeyLink = ADMIN_KEY_LINKS[connectionForm.provider_key];

  const highlightedVendor = useMemo(
    () => vendors.find((vendor) => vendor.id === data?.recommendation.vendorAccountId) ?? null,
    [data, vendors]
  );

  function setVendorField<K extends keyof AIVendorAccountInput>(key: K, value: AIVendorAccountInput[K]) {
    setVendorForm((current) => ({ ...current, [key]: value }));
  }

  function setConnectionField<K extends keyof SyncForm>(key: K, value: SyncForm[K]) {
    setConnectionForm((current) => ({ ...current, [key]: value }));
  }

  function handleConnectionProviderChange(provider_key: SyncForm['provider_key']) {
    setConnectionForm((current) => {
      const shouldResetLabel =
        current.label.trim() === '' || current.label === DEFAULT_SYNC_LABELS[current.provider_key];

      return {
        ...current,
        provider_key,
        label: shouldResetLabel ? DEFAULT_SYNC_LABELS[provider_key] : current.label,
      };
    });
  }

  function resetVendorForm() {
    setEditingVendorId(null);
    setVendorForm(emptyVendorForm);
  }

  function resetConnectionForm() {
    setEditingConnectionId(null);
    setConnectionForm(emptySyncForm);
  }

  function startEditVendor(vendor: AIOpsVendorView) {
    setEditingVendorId(vendor.id);
    setVendorForm({
      provider_key: vendor.provider_key ?? undefined,
      provider_name: vendor.provider_name,
      product_type: vendor.product_type,
      category: vendor.category,
      source_type: vendor.source_type,
      plan_name: vendor.plan_name ?? '',
      account_label: vendor.account_label ?? '',
      spend_current_period: vendor.spend_current_period,
      budget_limit: vendor.budget_limit,
      remaining_budget: vendor.remaining_budget,
      remaining_credits: vendor.remaining_credits,
      estimated_remaining_capacity: vendor.estimated_remaining_capacity,
      renewal_at: vendor.renewal_at ? vendor.renewal_at.slice(0, 16) : '',
      provider_url: vendor.provider_url ?? '',
      notes: vendor.notes ?? '',
      no_overage_allowed: vendor.no_overage_allowed,
    });
  }

  function startEditConnection(connection: SyncConnection) {
    setEditingConnectionId(connection.id);
    setConnectionForm({
      provider_key: connection.provider_key,
      label: connection.label,
      secret: '',
      monthlyBudgetUsd: connection.config?.monthlyBudgetUsd != null ? String(connection.config.monthlyBudgetUsd) : '',
      billingAnchorDay: connection.config?.billingAnchorDay != null ? String(connection.config.billingAnchorDay) : '',
    });
  }

  async function handleVendorSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingVendor(true);
    setError('');
    try {
      const res = await fetch(
        editingVendorId ? `/api/ai/vendor-accounts/${editingVendorId}` : '/api/ai/vendor-accounts',
        {
          method: editingVendorId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vendorForm),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save vendor');
      }
      resetVendorForm();
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vendor');
    } finally {
      setSavingVendor(false);
    }
  }

  async function handleConnectionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingConnection(true);
    setError('');
    try {
      const payload = {
        provider_key: connectionForm.provider_key,
        label: connectionForm.label,
        secret: connectionForm.secret,
        monthlyBudgetUsd: connectionForm.monthlyBudgetUsd === '' ? null : Number(connectionForm.monthlyBudgetUsd),
        billingAnchorDay: connectionForm.billingAnchorDay === '' ? null : Number(connectionForm.billingAnchorDay),
      };

      const res = await fetch(
        editingConnectionId
          ? `/api/ai/ops-dashboard/connections/${editingConnectionId}`
          : '/api/ai/ops-dashboard/connections',
        {
          method: editingConnectionId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save provider connection');
      }
      resetConnectionForm();
      setSyncMessage('Connection saved. Run sync to fetch fresh account data.');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider connection');
    } finally {
      setSavingConnection(false);
    }
  }

  async function handleDeleteConnection(connectionId: string) {
    if (!window.confirm('Delete this provider connection? Live account sync will stop for it.')) {
      return;
    }

    setError('');
    try {
      const res = await fetch(`/api/ai/ops-dashboard/connections/${connectionId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete provider connection');
      }
      if (editingConnectionId === connectionId) {
        resetConnectionForm();
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete provider connection');
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setError('');
    setSyncMessage('');
    try {
      const res = await fetch('/api/ai/ops-dashboard/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to sync provider data');
      }
      const results = json.data?.results ?? [];
      const okCount = results.filter((result: { status: string }) => result.status === 'ok').length;
      const errorCount = results.filter((result: { status: string }) => result.status === 'error').length;
      setSyncMessage(`Sync finished: ${okCount} ok, ${errorCount} errors.`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync provider data');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading AI operations dashboard...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-red-800 font-body text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-navy via-electric to-fuchsia-700 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/70">AI operations</p>
            <h2 className="mt-2 text-3xl font-heading font-bold">{data?.recommendation.title}</h2>
            <p className="mt-3 max-w-3xl font-body text-sm text-white/85">{data?.recommendation.message}</p>
          </div>
          <Button size="sm" variant="secondary" onClick={handleSyncNow} loading={syncing}>
            Sync providers
          </Button>
        </div>
        {highlightedVendor && (
          <p className="mt-4 text-xs text-white/70">
            Focus provider: {highlightedVendor.provider_name} - {highlightedVendor.confidence_level} confidence
          </p>
        )}
        {syncMessage && <p className="mt-3 text-xs text-white/75">{syncMessage}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
          <p className="text-navy/50 dark:text-slate-400 font-body text-xs uppercase tracking-wider mb-1">AI spend</p>
          <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">{formatMoney(data?.summary.aiSpendCurrentPeriod)}</p>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
          <p className="text-navy/50 dark:text-slate-400 font-body text-xs uppercase tracking-wider mb-1">Tracked software</p>
          <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">{formatMoney(data?.summary.trackedSoftwareSpendCurrentPeriod)}</p>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
          <p className="text-navy/50 dark:text-slate-400 font-body text-xs uppercase tracking-wider mb-1">Active alerts</p>
          <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">{data?.summary.activeAlertCount ?? 0}</p>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
          <p className="text-navy/50 dark:text-slate-400 font-body text-xs uppercase tracking-wider mb-1">Renewals</p>
          <p className="text-2xl font-heading font-bold text-navy dark:text-slate-100">{data?.summary.renewalCount ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading font-semibold text-navy dark:text-slate-100">OpenAI</p>
            <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold capitalize ${openAiConnection ? connectionStatusBadge(openAiConnection.last_sync_status) : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
              {openAiConnection ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <p className="mt-2 text-xs text-navy/50 dark:text-slate-400">
            {openAiConnection ? `${openAiConnection.label} saved` : 'Add an OpenAI admin key for live org usage sync.'}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading font-semibold text-navy dark:text-slate-100">Anthropic</p>
            <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold capitalize ${anthropicConnection ? connectionStatusBadge(anthropicConnection.last_sync_status) : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
              {anthropicConnection ? 'Connected' : 'Not connected'}
            </span>
          </div>
          <p className="mt-2 text-xs text-navy/50 dark:text-slate-400">
            {anthropicConnection ? `${anthropicConnection.label} saved` : 'Add an Anthropic admin key for live org usage sync.'}
          </p>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading font-semibold text-navy dark:text-slate-100">Gemini</p>
            <span className="inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold capitalize bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20">
              App usage only
            </span>
          </div>
          <p className="mt-2 text-xs text-navy/50 dark:text-slate-400">
            Agency Board tracks Gemini usage it makes itself, not your whole Google billing account.
          </p>
        </div>
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading font-semibold text-navy dark:text-slate-100">Claude Web</p>
            <span className="inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold capitalize bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20">
              Manual
            </span>
          </div>
          <p className="mt-2 text-xs text-navy/50 dark:text-slate-400">
            Subscription renewals and session availability still need manual tracking.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_1.35fr]">
        <div className="space-y-6">
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">
                  {editingConnectionId ? 'Edit live sync connection' : 'Connect live provider sync'}
                </h3>
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
                  Use provider admin keys for live billing and token sync. Unsupported products still stay manual.
                </p>
              </div>
              {editingConnectionId && (
                <Button size="sm" variant="ghost" onClick={resetConnectionForm}>Cancel</Button>
              )}
            </div>

            <form className="space-y-4" onSubmit={handleConnectionSubmit}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Provider</span>
                  <select
                    className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm"
                    value={connectionForm.provider_key}
                    onChange={(e) => handleConnectionProviderChange(e.target.value as SyncForm['provider_key'])}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                  <a
                    href={selectedAdminKeyLink.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-electric hover:text-electric/80"
                  >
                    {selectedAdminKeyLink.label}
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                  <p className="mt-1 text-[11px] text-navy/45 dark:text-slate-500">
                    {selectedAdminKeyLink.hint}
                  </p>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Label</span>
                  <input
                    className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm"
                    value={connectionForm.label}
                    onChange={(e) => setConnectionField('label', e.target.value)}
                    required
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Admin API key</span>
                  <input
                    type="password"
                    className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm"
                    value={connectionForm.secret}
                    onChange={(e) => setConnectionField('secret', e.target.value)}
                    placeholder={editingConnectionId ? 'Leave blank to keep the current secret' : 'Paste the admin key'}
                    required={!editingConnectionId}
                  />
                </label>
                {selectedProviderConnection && !editingConnectionId && (
                  <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                    {selectedProviderConnection.provider_key === 'openai' ? 'OpenAI' : 'Anthropic'} is already connected as `{selectedProviderConnection.label}`.
                    Use the edit button below if you want to replace or update that saved connection.
                  </div>
                )}
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Monthly budget (optional)</span>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm"
                    value={connectionForm.monthlyBudgetUsd}
                    onChange={(e) => setConnectionField('monthlyBudgetUsd', e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Billing anchor day</span>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm"
                    value={connectionForm.billingAnchorDay}
                    onChange={(e) => setConnectionField('billingAnchorDay', e.target.value)}
                    placeholder="1"
                  />
                </label>
              </div>

              <div className="flex justify-end">
                <Button type="submit" loading={savingConnection}>
                  {editingConnectionId ? 'Update connection' : 'Save connection'}
                </Button>
              </div>
            </form>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
            <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100 mb-3">Provider sync coverage</h3>
            <div className="space-y-3">
              {capabilities.map((capability) => (
                <div key={capability.providerKey} className="rounded-2xl border border-cream-dark dark:border-slate-700 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-heading font-semibold text-navy dark:text-slate-100">{capability.title}</p>
                      <p className="mt-1 text-sm text-navy/60 dark:text-slate-400">{capability.description}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold capitalize ${syncModeBadge(capability.syncMode)}`}>
                      {capability.syncMode.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">Live sync connections</h3>
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
                  Saved provider-side connections for live usage and spend sync.
                </p>
              </div>
            </div>

            {connections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cream-dark dark:border-slate-700 px-6 py-8 text-center text-sm text-navy/50 dark:text-slate-400">
                No live provider sync connections yet.
              </div>
            ) : (
              <div className="space-y-3">
                {connections.map((connection) => (
                  <div key={connection.id} className="rounded-2xl border border-cream-dark dark:border-slate-700 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-heading font-semibold text-navy dark:text-slate-100">{connection.label}</h4>
                          <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold capitalize ${connectionStatusBadge(connection.last_sync_status)}`}>
                            {connection.last_sync_status}
                          </span>
                        </div>
                        <p className="text-xs text-navy/40 dark:text-slate-500 mt-1">
                          {connection.provider_key} - {connection.connection_type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-navy/40 dark:text-slate-500 mt-1">
                          Last sync: {formatDate(connection.last_synced_at)}
                        </p>
                        {connection.last_error && (
                          <p className="mt-2 text-sm text-red-600">{connection.last_error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => startEditConnection(connection)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteConnection(connection.id)}>Delete</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">
                  {editingVendorId ? 'Edit tracked vendor' : 'Add tracked vendor'}
                </h3>
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
                  Manual fallback for Claude, Gemini limits, renewals, or any vendor without live sync.
                </p>
              </div>
              {editingVendorId && (
                <Button size="sm" variant="ghost" onClick={resetVendorForm}>Cancel</Button>
              )}
            </div>

            <form className="space-y-4" onSubmit={handleVendorSubmit}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Provider name</span>
                  <input className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.provider_name} onChange={(e) => setVendorField('provider_name', e.target.value)} required />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Product type</span>
                  <input className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.product_type} onChange={(e) => setVendorField('product_type', e.target.value)} required />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Category</span>
                  <select className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.category} onChange={(e) => setVendorField('category', e.target.value as AIVendorCategory)}>
                    {CATEGORIES.map((category) => <option key={category} value={category}>{category.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Source</span>
                  <select className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.source_type} onChange={(e) => setVendorField('source_type', e.target.value as AIVendorSourceType)}>
                    {SOURCE_TYPES.map((sourceType) => <option key={sourceType} value={sourceType}>{sourceType.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Plan name</span>
                  <input className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.plan_name ?? ''} onChange={(e) => setVendorField('plan_name', e.target.value)} />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Account label</span>
                  <input className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.account_label ?? ''} onChange={(e) => setVendorField('account_label', e.target.value)} />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Current spend</span>
                  <input type="number" step="0.01" className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.spend_current_period ?? ''} onChange={(e) => setVendorField('spend_current_period', e.target.value === '' ? null : Number(e.target.value))} />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Budget limit</span>
                  <input type="number" step="0.01" className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.budget_limit ?? ''} onChange={(e) => setVendorField('budget_limit', e.target.value === '' ? null : Number(e.target.value))} />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Remaining budget</span>
                  <input type="number" step="0.01" className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.remaining_budget ?? ''} onChange={(e) => setVendorField('remaining_budget', e.target.value === '' ? null : Number(e.target.value))} />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Remaining credits</span>
                  <input type="number" step="1" className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.remaining_credits ?? ''} onChange={(e) => setVendorField('remaining_credits', e.target.value === '' ? null : Number(e.target.value))} />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Estimated capacity (0-1)</span>
                  <input type="number" min="0" max="1" step="0.01" className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.estimated_remaining_capacity ?? ''} onChange={(e) => setVendorField('estimated_remaining_capacity', e.target.value === '' ? null : Number(e.target.value))} />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Renewal</span>
                  <input type="datetime-local" className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.renewal_at ?? ''} onChange={(e) => setVendorField('renewal_at', e.target.value)} />
                </label>
              </div>

              <label className="block">
                <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Provider URL</span>
                <input className="w-full px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.provider_url ?? ''} onChange={(e) => setVendorField('provider_url', e.target.value)} />
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Notes</span>
                <textarea className="w-full min-h-[110px] px-3 py-2 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-sm" value={vendorForm.notes ?? ''} onChange={(e) => setVendorField('notes', e.target.value)} />
              </label>

              <label className="flex items-center gap-2 text-sm text-navy dark:text-slate-200">
                <input type="checkbox" checked={vendorForm.no_overage_allowed ?? false} onChange={(e) => setVendorField('no_overage_allowed', e.target.checked)} />
                Never allow overage usage on this provider
              </label>

              <div className="flex justify-end">
                <Button type="submit" loading={savingVendor}>
                  {editingVendorId ? 'Update vendor' : 'Add vendor'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">Tracked vendors</h3>
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
                  Manual, app-tracked, and live-sync readiness cards.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={fetchData}>Refresh</Button>
            </div>

            {vendors.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cream-dark dark:border-slate-700 px-6 py-10 text-center text-sm text-navy/50 dark:text-slate-400">
                No tracked vendors yet. Add Claude, OpenAI, Gemini, Anthropic, or your supporting software stack.
              </div>
            ) : (
              <div className="space-y-3">
                {vendors.map((vendor) => (
                  <div key={vendor.id} className="rounded-2xl border border-cream-dark dark:border-slate-700 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-heading font-semibold text-navy dark:text-slate-100">{vendor.provider_name}</h4>
                          <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold capitalize ${badgeClass(vendor.status)}`}>
                            {vendor.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-navy/40 dark:text-slate-500 mt-1">
                          {vendor.product_type} - {vendor.category.replace(/_/g, ' ')} - {vendor.source_type.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => startEditVendor(vendor)}>Edit</Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-4 text-sm lg:grid-cols-3">
                      <div>
                        <p className="text-navy/40 dark:text-slate-500">Spend</p>
                        <p className="font-medium text-navy dark:text-slate-100">{formatMoney(vendor.spend_current_period)}</p>
                      </div>
                      <div>
                        <p className="text-navy/40 dark:text-slate-500">Renewal</p>
                        <p className="font-medium text-navy dark:text-slate-100">{formatDate(vendor.renewal_at)}</p>
                      </div>
                      <div>
                        <p className="text-navy/40 dark:text-slate-500">Budget left</p>
                        <p className="font-medium text-navy dark:text-slate-100">{formatMoney(vendor.remaining_budget)}</p>
                      </div>
                      <div>
                        <p className="text-navy/40 dark:text-slate-500">Credits left</p>
                        <p className="font-medium text-navy dark:text-slate-100">{vendor.remaining_credits ?? 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-navy/40 dark:text-slate-500">Tokens</p>
                        <p className="font-medium text-navy dark:text-slate-100">{formatCompactNumber(vendor.tracked_total_tokens_current_period)}</p>
                      </div>
                      <div>
                        <p className="text-navy/40 dark:text-slate-500">Requests</p>
                        <p className="font-medium text-navy dark:text-slate-100">{formatCompactNumber(vendor.tracked_requests_current_period)}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-navy/50 dark:text-slate-400">
                      {vendor.explanation_bits.slice(0, 2).join(' - ') || 'Waiting for more data'}
                    </p>
                    <p className="mt-1 text-xs text-navy/40 dark:text-slate-500">
                      Last synced: {formatDate(vendor.last_synced_at)}
                    </p>
                    {vendor.sync_error && (
                      <p className="mt-2 text-sm text-red-600">{vendor.sync_error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
              <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100 mb-3">Top alerts</h3>
              <div className="space-y-3">
                {(data?.alerts ?? []).length === 0 ? (
                  <p className="text-sm text-navy/50 dark:text-slate-400">No active alerts.</p>
                ) : (
                  data?.alerts.slice(0, 6).map((alert) => (
                    <div key={alert.id} className="rounded-2xl border border-cream-dark dark:border-slate-700 p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold capitalize ${severityClass(alert.severity)}`}>
                          {alert.severity}
                        </span>
                        <p className="font-medium text-navy dark:text-slate-100">{alert.title}</p>
                      </div>
                      <p className="mt-2 text-sm text-navy/60 dark:text-slate-400">{alert.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
              <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100 mb-3">Upcoming renewals</h3>
              <div className="space-y-3">
                {(data?.renewals ?? []).length === 0 ? (
                  <p className="text-sm text-navy/50 dark:text-slate-400">No renewals tracked yet.</p>
                ) : (
                  data?.renewals.map((renewal) => (
                    <div key={renewal.vendorAccountId} className="rounded-2xl border border-cream-dark dark:border-slate-700 p-3">
                      <p className="font-medium text-navy dark:text-slate-100">{renewal.vendorName}</p>
                      <p className="mt-1 text-sm text-navy/60 dark:text-slate-400">{formatDate(renewal.renewalAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
