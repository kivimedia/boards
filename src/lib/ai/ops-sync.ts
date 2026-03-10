import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptFromHex, encryptToHex } from '@/lib/encryption';
import { buildVendorView, type AIVendorAccount } from '@/lib/ai/ops-dashboard';
import type { AIProvider } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const OPENAI_API_BASE = 'https://api.openai.com/v1';
const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_USAGE_BETA = 'usage-cost-api-2025-02-19';

export type AIVendorSyncProvider = 'openai' | 'anthropic';
export type AIVendorSyncConnectionType = 'openai_admin_key' | 'anthropic_admin_key';
export type AIVendorSyncStatus = 'pending' | 'ok' | 'warning' | 'error';

export interface AIVendorSyncConnectionConfig {
  monthlyBudgetUsd?: number | null;
  billingAnchorDay?: number | null;
}

export interface AIVendorSyncConnection {
  id: string;
  owner_user_id: string;
  provider_key: AIVendorSyncProvider;
  connection_type: AIVendorSyncConnectionType;
  label: string;
  secret_encrypted: string;
  config: AIVendorSyncConnectionConfig;
  is_active: boolean;
  last_tested_at: string | null;
  last_synced_at: string | null;
  last_sync_status: AIVendorSyncStatus;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIVendorSyncConnectionInput {
  provider_key: AIVendorSyncProvider;
  label: string;
  secret: string;
  monthlyBudgetUsd?: number | null;
  billingAnchorDay?: number | null;
}

export interface AIVendorSyncCapability {
  providerKey: 'openai' | 'anthropic' | 'google' | 'claude';
  title: string;
  syncMode: 'live_admin' | 'app_usage' | 'manual';
  description: string;
}

export interface AIVendorSyncResult {
  connectionId: string | null;
  providerKey: 'openai' | 'anthropic' | 'google';
  label: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  vendorAccountId: string | null;
}

interface UsageAggregate {
  spendUsd: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface BillingWindow {
  start: Date;
  end: Date;
}

interface OpenAICostBucket {
  results?: Array<{
    amount?: { value?: number | string | null } | null;
    line_item?: string | null;
  }>;
}

interface OpenAIUsageBucket {
  results?: Array<{
    input_tokens?: number | string | null;
    output_tokens?: number | string | null;
    input_cached_tokens?: number | string | null;
    total_tokens?: number | string | null;
    num_model_requests?: number | string | null;
  }>;
}

interface PageResponse<TBucket> {
  data?: TBucket[];
  has_more?: boolean;
  next_page?: string | null;
}

function clampBillingAnchorDay(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(28, Math.max(1, Math.trunc(parsed)));
}

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveConnectionType(providerKey: AIVendorSyncProvider): AIVendorSyncConnectionType {
  return providerKey === 'openai' ? 'openai_admin_key' : 'anthropic_admin_key';
}

function providerLabel(provider: AIVendorSyncProvider | AIProvider | 'claude') {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'anthropic') return 'Anthropic';
  if (provider === 'google') return 'Google Gemini';
  if (provider === 'browserless') return 'Browserless';
  return provider;
}

function providerDashboardUrl(provider: AIVendorSyncProvider | AIProvider | 'claude') {
  if (provider === 'openai') return 'https://platform.openai.com/settings/organization';
  if (provider === 'anthropic') return 'https://console.anthropic.com/settings';
  if (provider === 'google') return 'https://aistudio.google.com/app/usage';
  return null;
}

function getBillingWindow(anchorDay?: number | null): BillingWindow {
  const now = new Date();
  const day = clampBillingAnchorDay(anchorDay) ?? 1;

  if (day === 1) {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)),
    };
  }

  const candidateStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 0, 0, 0, 0));
  if (now.getTime() >= candidateStart.getTime()) {
    return {
      start: candidateStart,
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day, 0, 0, 0, 0)),
    };
  }

  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day, 0, 0, 0, 0)),
    end: candidateStart,
  };
}

function computeStaleAfter(lastSyncedAt: Date) {
  return new Date(lastSyncedAt.getTime() + 2 * DAY_MS).toISOString();
}

function toIso(date: Date) {
  return date.toISOString();
}

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function safeMessage(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  if (error.message.length > 350) return error.message.slice(0, 350);
  return error.message;
}

async function fetchJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 240)}`);
  }

  return response.json() as Promise<T>;
}

async function fetchPagedOpenAI<TBucket>(
  path: string,
  adminKey: string,
  params: Record<string, string | number>
) {
  const pages: TBucket[] = [];
  let nextPage: string | null = null;

  while (true) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      search.set(key, String(value));
    }
    if (nextPage) search.set('page', nextPage);

    const payload = await fetchJson<PageResponse<TBucket>>(
      `${OPENAI_API_BASE}${path}?${search.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${adminKey}`,
        },
      }
    );

    pages.push(...(payload.data ?? []));

    if (!payload.has_more || !payload.next_page) {
      break;
    }

    nextPage = payload.next_page;
  }

  return pages;
}

async function fetchPagedAnthropic<TBucket>(
  path: string,
  adminKey: string,
  body: Record<string, unknown>
) {
  const pages: TBucket[] = [];
  let page: string | null = null;

  while (true) {
    const payload: PageResponse<TBucket> = await fetchJson<PageResponse<TBucket>>(
      `${ANTHROPIC_API_BASE}${path}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': adminKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-beta': ANTHROPIC_USAGE_BETA,
        },
        body: JSON.stringify({
          ...body,
          ...(page ? { page } : {}),
        }),
      }
    );

    pages.push(...(payload.data ?? []));

    if (!payload.has_more || !payload.next_page) {
      break;
    }

    page = payload.next_page;
  }

  return pages;
}

export function sumOpenAICosts(buckets: OpenAICostBucket[]) {
  let spendUsd = 0;
  for (const bucket of buckets) {
    for (const result of bucket.results ?? []) {
      spendUsd += Number(result.amount?.value ?? 0) || 0;
    }
  }
  return spendUsd;
}

export function sumOpenAIUsage(buckets: OpenAIUsageBucket[]): UsageAggregate {
  let requestCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const bucket of buckets) {
    for (const result of bucket.results ?? []) {
      const input = Number(result.input_tokens ?? 0) || 0;
      const output = Number(result.output_tokens ?? 0) || 0;
      const cached = Number(result.input_cached_tokens ?? 0) || 0;
      const total = Number(result.total_tokens ?? 0) || input + output + cached;

      requestCount += Number(result.num_model_requests ?? 0) || 0;
      inputTokens += input;
      outputTokens += output;
      totalTokens += total;
    }
  }

  return {
    spendUsd: 0,
    requestCount,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export function sumAnthropicCosts(buckets: Array<{ results?: Array<Record<string, unknown>> }>) {
  let spendUsd = 0;
  for (const bucket of buckets) {
    for (const result of bucket.results ?? []) {
      const cents =
        Number(result.cost_cents ?? 0) ||
        Number((result.cost as { cents?: number } | undefined)?.cents ?? 0) ||
        0;
      spendUsd += cents / 100;
    }
  }
  return spendUsd;
}

export function sumAnthropicUsage(buckets: Array<{ results?: Array<Record<string, unknown>> }>): UsageAggregate {
  let requestCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const bucket of buckets) {
    for (const result of bucket.results ?? []) {
      const input = Number(result.input_tokens ?? 0) || 0;
      const output = Number(result.output_tokens ?? 0) || 0;
      const cacheCreate = Number(result.cache_creation_input_tokens ?? 0) || 0;
      const cacheRead = Number(result.cache_read_input_tokens ?? 0) || 0;
      const total = input + output + cacheCreate + cacheRead;

      requestCount +=
        Number(result.requests ?? 0) ||
        Number(result.request_count ?? 0) ||
        Number(result.api_requests ?? 0) ||
        0;
      inputTokens += input + cacheCreate + cacheRead;
      outputTokens += output;
      totalTokens += total;
    }
  }

  return {
    spendUsd: 0,
    requestCount,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

async function fetchOpenAISummary(
  adminKey: string,
  window: BillingWindow
): Promise<UsageAggregate> {
  const [costBuckets, usageBuckets] = await Promise.all([
    fetchPagedOpenAI<OpenAICostBucket>('/organization/costs', adminKey, {
      start_time: toUnixSeconds(window.start),
      end_time: toUnixSeconds(window.end),
      bucket_width: '1d',
      limit: 180,
    }),
    fetchPagedOpenAI<OpenAIUsageBucket>('/organization/usage/completions', adminKey, {
      start_time: toUnixSeconds(window.start),
      end_time: toUnixSeconds(window.end),
      bucket_width: '1d',
      limit: 180,
    }),
  ]);

  const usage = sumOpenAIUsage(usageBuckets);
  usage.spendUsd = sumOpenAICosts(costBuckets);
  return usage;
}

async function fetchAnthropicSummary(
  adminKey: string,
  window: BillingWindow
): Promise<UsageAggregate> {
  const [costBuckets, usageBuckets] = await Promise.all([
    fetchPagedAnthropic<{ results?: Array<Record<string, unknown>> }>(
      '/organizations/cost_report',
      adminKey,
      {
        starting_at: toIso(window.start),
        ending_at: toIso(window.end),
        bucket_width: '1d',
      }
    ),
    fetchPagedAnthropic<{ results?: Array<Record<string, unknown>> }>(
      '/organizations/usage_report/messages',
      adminKey,
      {
        starting_at: toIso(window.start),
        ending_at: toIso(window.end),
        bucket_width: '1d',
      }
    ),
  ]);

  const usage = sumAnthropicUsage(usageBuckets);
  usage.spendUsd = sumAnthropicCosts(costBuckets);
  return usage;
}

function buildSyncedVendorRecord(
  existing: Partial<AIVendorAccount> | null,
  input: {
    ownerUserId: string;
    providerKey: AIProvider | 'claude';
    providerName: string;
    productType: string;
    category: AIVendorAccount['category'];
    accountLabel: string;
    sourceType: AIVendorAccount['source_type'];
    spendUsd: number;
    budgetLimit: number | null;
    remainingBudget: number | null;
    billingWindow: BillingWindow;
    lastSyncedAt: Date;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    syncConnectionId?: string | null;
    externalAccountRef: string;
    syncError?: string | null;
  }
) {
  const nowIso = input.lastSyncedAt.toISOString();
  const record: AIVendorAccount = {
    id: existing?.id ?? 'temp',
    owner_user_id: input.ownerUserId,
    provider_key: input.providerKey,
    provider_name: input.providerName,
    product_type: input.productType,
    category: input.category,
    status: existing?.status ?? 'unknown',
    source_type: input.sourceType,
    confidence_level: existing?.confidence_level ?? 'low',
    plan_name: existing?.plan_name ?? null,
    account_label: existing?.account_label ?? input.accountLabel,
    billing_period_start: input.billingWindow.start.toISOString(),
    billing_period_end: input.billingWindow.end.toISOString(),
    spend_current_period: Math.round(input.spendUsd * 100) / 100,
    budget_limit: input.budgetLimit,
    remaining_budget: input.remainingBudget,
    remaining_credits: existing?.remaining_credits ?? null,
    estimated_remaining_capacity: existing?.estimated_remaining_capacity ?? null,
    renewal_at: input.billingWindow.end.toISOString(),
    last_synced_at: nowIso,
    stale_after: computeStaleAfter(input.lastSyncedAt),
    no_overage_allowed: existing?.no_overage_allowed ?? false,
    provider_url: existing?.provider_url ?? providerDashboardUrl(input.providerKey),
    notes: existing?.notes ?? null,
    sync_error: input.syncError ?? null,
    is_manual: false,
    metadata: {
      ...(existing?.metadata ?? {}),
      external_account_ref: input.externalAccountRef,
    },
    created_at: existing?.created_at ?? nowIso,
    updated_at: nowIso,
    sync_connection_id: input.syncConnectionId ?? null,
    external_account_ref: input.externalAccountRef,
    tracked_requests_current_period: input.requestCount,
    tracked_input_tokens_current_period: input.inputTokens,
    tracked_output_tokens_current_period: input.outputTokens,
    tracked_total_tokens_current_period: input.totalTokens,
  } as AIVendorAccount;

  const derived = buildVendorView(record);
  return {
    ...record,
    status: derived.status,
    confidence_level: derived.confidence_level,
  };
}

async function findExistingVendorAccount(
  supabase: SupabaseClient,
  params: { syncConnectionId?: string | null; externalAccountRef: string }
) {
  let query = supabase
    .from('ai_vendor_accounts')
    .select('*')
    .eq('external_account_ref', params.externalAccountRef)
    .limit(1);

  query = params.syncConnectionId
    ? query.eq('sync_connection_id', params.syncConnectionId)
    : query.is('sync_connection_id', null);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as AIVendorAccount | null) ?? null;
}

async function saveVendorAccount(supabase: SupabaseClient, record: AIVendorAccount) {
  const existing = await findExistingVendorAccount(supabase, {
    syncConnectionId: (record as AIVendorAccount & { sync_connection_id?: string | null }).sync_connection_id ?? null,
    externalAccountRef: (record as AIVendorAccount & { external_account_ref?: string | null }).external_account_ref ?? '',
  });

  const payload = {
    owner_user_id: record.owner_user_id,
    provider_key: record.provider_key,
    provider_name: record.provider_name,
    product_type: record.product_type,
    category: record.category,
    status: record.status,
    source_type: record.source_type,
    confidence_level: record.confidence_level,
    plan_name: record.plan_name,
    account_label: record.account_label,
    billing_period_start: record.billing_period_start,
    billing_period_end: record.billing_period_end,
    spend_current_period: record.spend_current_period,
    budget_limit: record.budget_limit,
    remaining_budget: record.remaining_budget,
    remaining_credits: record.remaining_credits,
    estimated_remaining_capacity: record.estimated_remaining_capacity,
    renewal_at: record.renewal_at,
    last_synced_at: record.last_synced_at,
    stale_after: record.stale_after,
    no_overage_allowed: record.no_overage_allowed,
    provider_url: record.provider_url,
    notes: record.notes,
    sync_error: record.sync_error,
    is_manual: record.is_manual,
    metadata: record.metadata,
    sync_connection_id: (record as AIVendorAccount & { sync_connection_id?: string | null }).sync_connection_id ?? null,
    external_account_ref: (record as AIVendorAccount & { external_account_ref?: string | null }).external_account_ref ?? null,
    tracked_requests_current_period: (record as AIVendorAccount & { tracked_requests_current_period?: number | null }).tracked_requests_current_period ?? null,
    tracked_input_tokens_current_period: (record as AIVendorAccount & { tracked_input_tokens_current_period?: number | null }).tracked_input_tokens_current_period ?? null,
    tracked_output_tokens_current_period: (record as AIVendorAccount & { tracked_output_tokens_current_period?: number | null }).tracked_output_tokens_current_period ?? null,
    tracked_total_tokens_current_period: (record as AIVendorAccount & { tracked_total_tokens_current_period?: number | null }).tracked_total_tokens_current_period ?? null,
  };

  const { data, error } = existing
    ? await supabase
        .from('ai_vendor_accounts')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single()
    : await supabase
        .from('ai_vendor_accounts')
        .insert(payload)
        .select('*')
        .single();

  if (error) throw error;
  return data as AIVendorAccount;
}

export function getSyncCapabilities(): AIVendorSyncCapability[] {
  return [
    {
      providerKey: 'openai',
      title: 'OpenAI',
      syncMode: 'live_admin',
      description: 'Live account sync via OpenAI admin API key for org costs and usage.',
    },
    {
      providerKey: 'anthropic',
      title: 'Anthropic',
      syncMode: 'live_admin',
      description: 'Live account sync via Anthropic admin API key for org cost and message usage reports.',
    },
    {
      providerKey: 'google',
      title: 'Gemini / Google AI',
      syncMode: 'app_usage',
      description: 'Agency Board usage is tracked automatically, but Google AI Studio does not expose the same live account-spend sync path here.',
    },
    {
      providerKey: 'claude',
      title: 'Claude subscription',
      syncMode: 'manual',
      description: 'Claude web subscription/session limits still need manual tracking for renewals and session availability.',
    },
  ];
}

export async function listSyncConnections(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('ai_vendor_sync_connections')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AIVendorSyncConnection[];
}

export async function createSyncConnection(
  supabase: SupabaseClient,
  userId: string,
  input: AIVendorSyncConnectionInput
) {
  const secret = input.secret.trim();
  if (!secret) {
    throw new Error('Admin API key is required.');
  }

  const secretEncrypted = encryptToHex(secret);
  const config: AIVendorSyncConnectionConfig = {
    monthlyBudgetUsd: toNullableNumber(input.monthlyBudgetUsd),
    billingAnchorDay: clampBillingAnchorDay(input.billingAnchorDay),
  };

  const { data, error } = await supabase
    .from('ai_vendor_sync_connections')
    .insert({
      owner_user_id: userId,
      provider_key: input.provider_key,
      connection_type: deriveConnectionType(input.provider_key),
      label: input.label.trim(),
      secret_encrypted: secretEncrypted,
      config,
      is_active: true,
      last_sync_status: 'pending',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as AIVendorSyncConnection;
}

export async function updateSyncConnection(
  supabase: SupabaseClient,
  connectionId: string,
  input: Partial<AIVendorSyncConnectionInput>
) {
  const { data: existing, error: existingError } = await supabase
    .from('ai_vendor_sync_connections')
    .select('*')
    .eq('id', connectionId)
    .single();

  if (existingError || !existing) {
    throw existingError ?? new Error('Connection not found.');
  }

  const nextConfig: AIVendorSyncConnectionConfig = {
    ...(existing.config ?? {}),
    ...(input.monthlyBudgetUsd !== undefined
      ? { monthlyBudgetUsd: toNullableNumber(input.monthlyBudgetUsd) }
      : {}),
    ...(input.billingAnchorDay !== undefined
      ? { billingAnchorDay: clampBillingAnchorDay(input.billingAnchorDay) }
      : {}),
  };

  const updates: Record<string, unknown> = {
    label: input.label?.trim() || existing.label,
    config: nextConfig,
  };

  if (input.secret?.trim()) {
    updates.secret_encrypted = encryptToHex(input.secret.trim());
  }

  const { data, error } = await supabase
    .from('ai_vendor_sync_connections')
    .update(updates)
    .eq('id', connectionId)
    .select('*')
    .single();

  if (error) throw error;
  return data as AIVendorSyncConnection;
}

export async function deleteSyncConnection(supabase: SupabaseClient, connectionId: string) {
  const { error } = await supabase
    .from('ai_vendor_sync_connections')
    .delete()
    .eq('id', connectionId);

  if (error) throw error;
}

async function syncInternalUsageVendorAccounts(supabase: SupabaseClient, userId: string) {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1, 0, 0, 0, 0));
  const now = new Date();

  const { data, error } = await supabase
    .from('ai_usage_log')
    .select('provider, input_tokens, output_tokens, total_tokens, cost_usd')
    .eq('status', 'success')
    .gte('created_at', monthStart.toISOString())
    .lt('created_at', monthEnd.toISOString());

  if (error) throw error;

  const aggregates = new Map<'openai' | 'anthropic' | 'google', UsageAggregate>();
  for (const row of data ?? []) {
    const provider = row.provider as 'openai' | 'anthropic' | 'google';
    if (!['openai', 'anthropic', 'google'].includes(provider)) continue;

    const current = aggregates.get(provider) ?? {
      spendUsd: 0,
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    current.spendUsd += Number(row.cost_usd ?? 0) || 0;
    current.requestCount += 1;
    current.inputTokens += Number(row.input_tokens ?? 0) || 0;
    current.outputTokens += Number(row.output_tokens ?? 0) || 0;
    current.totalTokens += Number(row.total_tokens ?? 0) || 0;
    aggregates.set(provider, current);
  }

  const results: AIVendorSyncResult[] = [];
  for (const [provider, aggregate] of aggregates.entries()) {
    const existing = await findExistingVendorAccount(supabase, {
      syncConnectionId: null,
      externalAccountRef: `internal_usage:${provider}`,
    });

    const record = buildSyncedVendorRecord(existing, {
      ownerUserId: userId,
      providerKey: provider,
      providerName: providerLabel(provider),
      productType: 'Agency Board tracked usage',
      category: provider === 'google' ? 'ai_api' : 'ai_api',
      accountLabel: 'Internal tracked usage',
      sourceType: 'api_synced',
      spendUsd: aggregate.spendUsd,
      budgetLimit: existing?.budget_limit ?? null,
      remainingBudget:
        existing?.budget_limit != null
          ? Math.max(0, existing.budget_limit - aggregate.spendUsd)
          : null,
      billingWindow: {
        start: monthStart,
        end: monthEnd,
      },
      lastSyncedAt: now,
      requestCount: aggregate.requestCount,
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      totalTokens: aggregate.totalTokens,
      syncConnectionId: null,
      externalAccountRef: `internal_usage:${provider}`,
    });

    const saved = await saveVendorAccount(supabase, record);
    results.push({
      connectionId: null,
      providerKey: provider,
      label: `${providerLabel(provider)} app usage`,
      status: 'ok',
      message: 'Synced internal Agency Board usage log.',
      vendorAccountId: saved.id,
    });
  }

  return results;
}

async function markConnectionStatus(
  supabase: SupabaseClient,
  connectionId: string,
  status: AIVendorSyncStatus,
  error: string | null
) {
  const { error: updateError } = await supabase
    .from('ai_vendor_sync_connections')
    .update({
      last_tested_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      last_sync_status: status,
      last_error: error,
    })
    .eq('id', connectionId);

  if (updateError) throw updateError;
}

async function syncProviderConnection(
  supabase: SupabaseClient,
  userId: string,
  connection: AIVendorSyncConnection
) {
  const adminKey = decryptFromHex(connection.secret_encrypted);
  const billingWindow = getBillingWindow(connection.config?.billingAnchorDay);
  const monthlyBudgetUsd = toNullableNumber(connection.config?.monthlyBudgetUsd);
  const now = new Date();

  const aggregate =
    connection.provider_key === 'openai'
      ? await fetchOpenAISummary(adminKey, billingWindow)
      : await fetchAnthropicSummary(adminKey, billingWindow);

  const existing = await findExistingVendorAccount(supabase, {
    syncConnectionId: connection.id,
    externalAccountRef: `${connection.provider_key}:organization`,
  });

  const record = buildSyncedVendorRecord(existing, {
    ownerUserId: userId,
    providerKey: connection.provider_key,
    providerName: providerLabel(connection.provider_key),
    productType: 'Live admin account sync',
    category: 'ai_api',
    accountLabel: connection.label,
    sourceType: 'api_synced',
    spendUsd: aggregate.spendUsd,
    budgetLimit: monthlyBudgetUsd,
    remainingBudget:
      monthlyBudgetUsd != null ? Math.max(0, monthlyBudgetUsd - aggregate.spendUsd) : null,
    billingWindow,
    lastSyncedAt: now,
    requestCount: aggregate.requestCount,
    inputTokens: aggregate.inputTokens,
    outputTokens: aggregate.outputTokens,
    totalTokens: aggregate.totalTokens,
    syncConnectionId: connection.id,
    externalAccountRef: `${connection.provider_key}:organization`,
  });

  const saved = await saveVendorAccount(supabase, record);
  await markConnectionStatus(supabase, connection.id, 'ok', null);

  return {
    connectionId: connection.id,
    providerKey: connection.provider_key,
    label: connection.label,
    status: 'ok' as const,
    message: `Synced live ${providerLabel(connection.provider_key)} account usage and spend.`,
    vendorAccountId: saved.id,
  };
}

export async function syncAllProviderData(supabase: SupabaseClient, userId: string) {
  const results: AIVendorSyncResult[] = [];

  results.push(...(await syncInternalUsageVendorAccounts(supabase, userId)));

  const connections = await listSyncConnections(supabase);
  for (const connection of connections.filter((entry) => entry.is_active)) {
    try {
      results.push(await syncProviderConnection(supabase, userId, connection));
    } catch (error) {
      const message = safeMessage(error);
      await markConnectionStatus(supabase, connection.id, 'error', message);

      const existing = await findExistingVendorAccount(supabase, {
        syncConnectionId: connection.id,
        externalAccountRef: `${connection.provider_key}:organization`,
      });

      if (existing) {
        await supabase
          .from('ai_vendor_accounts')
          .update({
            sync_error: message,
            last_synced_at: new Date().toISOString(),
            stale_after: computeStaleAfter(new Date()),
          })
          .eq('id', existing.id);
      }

      results.push({
        connectionId: connection.id,
        providerKey: connection.provider_key,
        label: connection.label,
        status: 'error',
        message,
        vendorAccountId: existing?.id ?? null,
      });
    }
  }

  return results;
}
