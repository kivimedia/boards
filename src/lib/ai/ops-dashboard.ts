import type { SupabaseClient } from '@supabase/supabase-js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_RENEWAL_HOURS = 72;

export type AIVendorStatus =
  | 'healthy'
  | 'nearing_limit'
  | 'exhausted'
  | 'renewed_recently'
  | 'unknown'
  | 'manual_update_needed';

export type AIVendorSourceType =
  | 'api_synced'
  | 'manual'
  | 'estimated'
  | 'email_derived'
  | 'browser_assisted';

export type AIVendorCategory =
  | 'ai_subscription'
  | 'ai_api'
  | 'hosting'
  | 'database'
  | 'developer_tool'
  | 'monitoring'
  | 'other';

export type AIVendorConfidence = 'high' | 'medium' | 'low';

export interface AIVendorAccount {
  id: string;
  owner_user_id: string | null;
  provider_key: string | null;
  provider_name: string;
  product_type: string;
  category: AIVendorCategory;
  status: AIVendorStatus;
  source_type: AIVendorSourceType;
  confidence_level: AIVendorConfidence;
  plan_name: string | null;
  account_label: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  spend_current_period: number | null;
  budget_limit: number | null;
  remaining_budget: number | null;
  remaining_credits: number | null;
  estimated_remaining_capacity: number | null;
  renewal_at: string | null;
  last_synced_at: string | null;
  stale_after: string | null;
  no_overage_allowed: boolean;
  provider_url: string | null;
  notes: string | null;
  sync_error: string | null;
  is_manual: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AIVendorSpendSnapshot {
  id: string;
  vendor_account_id: string;
  amount: number;
  recorded_at: string;
  source_type: AIVendorSourceType;
  notes: string | null;
}

export interface AIOpsVendorView extends AIVendorAccount {
  readiness_score: number;
  explanation_bits: string[];
  freshness_state: 'fresh' | 'stale' | 'unknown';
}

export interface AIOpsAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  vendor_account_id: string | null;
  vendor_name: string | null;
}

export interface AIOpsDashboardData {
  summary: {
    aiSpendCurrentPeriod: number;
    trackedSoftwareSpendCurrentPeriod: number;
    totalTrackedSpend: number;
    activeAlertCount: number;
    renewalCount: number;
  };
  recommendation: {
    title: string;
    message: string;
    vendorAccountId: string | null;
    confidence: AIVendorConfidence;
  };
  vendors: AIOpsVendorView[];
  alerts: AIOpsAlert[];
  renewals: Array<{
    vendorAccountId: string;
    vendorName: string;
    renewalAt: string;
    sourceType: AIVendorSourceType;
  }>;
}

export interface AIVendorAccountInput {
  provider_key?: string | null;
  provider_name: string;
  product_type: string;
  category: AIVendorCategory;
  source_type?: AIVendorSourceType;
  plan_name?: string | null;
  account_label?: string | null;
  spend_current_period?: number | null;
  budget_limit?: number | null;
  remaining_budget?: number | null;
  remaining_credits?: number | null;
  estimated_remaining_capacity?: number | null;
  renewal_at?: string | null;
  provider_url?: string | null;
  notes?: string | null;
  no_overage_allowed?: boolean;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function staleAfterForSource(sourceType: AIVendorSourceType, lastSyncedAt: Date) {
  return addDays(lastSyncedAt, sourceType === 'api_synced' ? 2 : 7).toISOString();
}

function computeConfidenceLevel(sourceType: AIVendorSourceType, staleAfter?: string | null): AIVendorConfidence {
  if (!staleAfter) return sourceType === 'api_synced' ? 'medium' : 'low';
  const isStale = new Date(staleAfter).getTime() < Date.now();
  if (isStale) return 'low';
  if (sourceType === 'api_synced') return 'high';
  return 'medium';
}

function deriveStatus(vendor: AIVendorAccount): AIVendorStatus {
  const stale = vendor.stale_after ? new Date(vendor.stale_after).getTime() < Date.now() : false;
  if (vendor.is_manual && stale) return 'manual_update_needed';
  if (
    (vendor.remaining_budget ?? Number.POSITIVE_INFINITY) <= 0 ||
    (vendor.remaining_credits ?? Number.POSITIVE_INFINITY) <= 0 ||
    (vendor.estimated_remaining_capacity ?? 1) <= 0.05
  ) {
    return 'exhausted';
  }
  if (
    (vendor.remaining_budget != null && vendor.remaining_budget <= 20) ||
    (vendor.remaining_credits != null && vendor.remaining_credits <= 20) ||
    (vendor.estimated_remaining_capacity != null && vendor.estimated_remaining_capacity <= 0.2)
  ) {
    return 'nearing_limit';
  }
  if (vendor.renewal_at) {
    const renewalAge = Date.now() - new Date(vendor.renewal_at).getTime();
    if (renewalAge >= 0 && renewalAge <= RECENT_RENEWAL_HOURS * 60 * 60 * 1000) {
      return 'renewed_recently';
    }
  }
  if (
    vendor.remaining_budget == null &&
    vendor.remaining_credits == null &&
    vendor.estimated_remaining_capacity == null &&
    vendor.spend_current_period == null &&
    !vendor.renewal_at
  ) {
    return 'unknown';
  }
  return 'healthy';
}

export function buildVendorView(vendor: AIVendorAccount): AIOpsVendorView {
  const status = deriveStatus(vendor);
  const confidence = computeConfidenceLevel(vendor.source_type, vendor.stale_after);
  let readinessScore = 50;
  const explanationBits: string[] = [];

  if (status === 'healthy') {
    readinessScore += 25;
    explanationBits.push('healthy capacity');
  }
  if (status === 'renewed_recently') {
    readinessScore += 20;
    explanationBits.push('renewed recently');
  }
  if (status === 'nearing_limit') {
    readinessScore -= 20;
    explanationBits.push('near limit');
  }
  if (status === 'manual_update_needed') {
    readinessScore -= 30;
    explanationBits.push('manual review needed');
  }
  if (status === 'exhausted') {
    readinessScore -= 60;
    explanationBits.push('appears exhausted');
  }
  if (status === 'unknown') {
    readinessScore -= 15;
    explanationBits.push('insufficient data');
  }
  if (vendor.no_overage_allowed) {
    readinessScore -= 10;
    explanationBits.push('no overage allowed');
  }
  if (confidence === 'low') {
    readinessScore -= 10;
    explanationBits.push('low confidence');
  }

  return {
    ...vendor,
    status,
    confidence_level: confidence,
    readiness_score: readinessScore,
    explanation_bits: explanationBits,
    freshness_state: vendor.stale_after ? (new Date(vendor.stale_after).getTime() < Date.now() ? 'stale' : 'fresh') : 'unknown',
  };
}

export function computeOpsAlerts(vendors: AIOpsVendorView[]): AIOpsAlert[] {
  const alerts: AIOpsAlert[] = [];
  for (const vendor of vendors) {
    if (vendor.status === 'nearing_limit') {
      alerts.push({
        id: `${vendor.id}:nearing_limit`,
        severity: vendor.no_overage_allowed ? 'critical' : 'warning',
        title: `${vendor.provider_name} is nearing its limit`,
        message: 'This provider looks risky for longer or expensive sessions.',
        vendor_account_id: vendor.id,
        vendor_name: vendor.provider_name,
      });
    }
    if (vendor.remaining_budget != null && vendor.remaining_budget <= 20) {
      alerts.push({
        id: `${vendor.id}:remaining_budget`,
        severity: vendor.no_overage_allowed ? 'critical' : 'warning',
        title: `${vendor.provider_name} budget is low`,
        message: `${vendor.remaining_budget.toFixed(2)} remains in the current period.`,
        vendor_account_id: vendor.id,
        vendor_name: vendor.provider_name,
      });
    }
    if (vendor.remaining_credits != null && vendor.remaining_credits <= 20) {
      alerts.push({
        id: `${vendor.id}:remaining_credits`,
        severity: vendor.no_overage_allowed ? 'critical' : 'warning',
        title: `${vendor.provider_name} credits are low`,
        message: `${vendor.remaining_credits} credits remain before exhaustion.`,
        vendor_account_id: vendor.id,
        vendor_name: vendor.provider_name,
      });
    }
    if (vendor.freshness_state === 'stale') {
      alerts.push({
        id: `${vendor.id}:stale`,
        severity: 'warning',
        title: `${vendor.provider_name} data is stale`,
        message: 'Manual review is needed before relying on this provider.',
        vendor_account_id: vendor.id,
        vendor_name: vendor.provider_name,
      });
    }
    if (vendor.renewal_at) {
      const renewalDiff = new Date(vendor.renewal_at).getTime() - Date.now();
      if (renewalDiff > 0 && renewalDiff <= 5 * DAY_MS) {
        alerts.push({
          id: `${vendor.id}:renewal`,
          severity: 'info',
          title: `${vendor.provider_name} renews soon`,
          message: `Renewal is scheduled for ${new Date(vendor.renewal_at).toLocaleString()}.`,
          vendor_account_id: vendor.id,
          vendor_name: vendor.provider_name,
        });
      }
    }
    if (vendor.sync_error) {
      alerts.push({
        id: `${vendor.id}:sync`,
        severity: 'warning',
        title: `${vendor.provider_name} sync needs attention`,
        message: vendor.sync_error,
        vendor_account_id: vendor.id,
        vendor_name: vendor.provider_name,
      });
    }
  }

  return alerts.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}

function severityWeight(severity: AIOpsAlert['severity']) {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  return 1;
}

export function recommendVendor(vendors: AIOpsVendorView[]) {
  const candidates = vendors
    .filter((vendor) => vendor.status !== 'exhausted')
    .sort((a, b) => b.readiness_score - a.readiness_score);
  const best = candidates[0];

  if (!best || best.readiness_score < 30) {
    return {
      title: 'Manual check needed',
      message: 'Provider data is too stale or incomplete to recommend a safe option confidently.',
      vendorAccountId: null,
      confidence: 'low' as AIVendorConfidence,
    };
  }

  return {
    title: `Use ${best.provider_name} next`,
    message: `${best.provider_name} looks strongest right now because it is ${best.explanation_bits.slice(0, 2).join(', ')}.`,
    vendorAccountId: best.id,
    confidence: best.confidence_level,
  };
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeInput(input: AIVendorAccountInput) {
  const now = new Date();
  const sourceType = input.source_type ?? 'manual';
  return {
    provider_key: input.provider_key ?? null,
    provider_name: input.provider_name.trim(),
    product_type: input.product_type.trim(),
    category: input.category,
    source_type: sourceType,
    plan_name: input.plan_name?.trim() || null,
    account_label: input.account_label?.trim() || null,
    spend_current_period: toNumber(input.spend_current_period),
    budget_limit: toNumber(input.budget_limit),
    remaining_budget: toNumber(input.remaining_budget),
    remaining_credits: toNumber(input.remaining_credits),
    estimated_remaining_capacity: toNumber(input.estimated_remaining_capacity),
    renewal_at: input.renewal_at ? new Date(input.renewal_at).toISOString() : null,
    provider_url: input.provider_url?.trim() || null,
    notes: input.notes?.trim() || null,
    no_overage_allowed: Boolean(input.no_overage_allowed),
    is_manual: sourceType !== 'api_synced',
    last_synced_at: now.toISOString(),
    stale_after: staleAfterForSource(sourceType, now),
  };
}

export async function listVendorAccounts(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('ai_vendor_accounts')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as AIVendorAccount[];
}

export async function createVendorAccount(
  supabase: SupabaseClient,
  userId: string,
  input: AIVendorAccountInput
) {
  const normalized = normalizeInput(input);
  const baseRecord = {
    owner_user_id: userId,
    ...normalized,
  };
  const derived = buildVendorView({
    id: 'temp',
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'unknown',
    confidence_level: 'low',
    sync_error: null,
    billing_period_start: null,
    billing_period_end: null,
    ...baseRecord,
  });

  const { data, error } = await supabase
    .from('ai_vendor_accounts')
    .insert({
      ...baseRecord,
      status: derived.status,
      confidence_level: derived.confidence_level,
    })
    .select('*')
    .single();

  if (error) throw error;

  if (derived.spend_current_period != null) {
    await supabase.from('ai_vendor_spend_snapshots').insert({
      vendor_account_id: data.id,
      amount: derived.spend_current_period,
      source_type: derived.source_type,
      notes: 'Initial vendor setup',
    });
  }

  return data as AIVendorAccount;
}

export async function updateVendorAccount(
  supabase: SupabaseClient,
  vendorId: string,
  input: Partial<AIVendorAccountInput>
) {
  const { data: existing, error: existingError } = await supabase
    .from('ai_vendor_accounts')
    .select('*')
    .eq('id', vendorId)
    .single();

  if (existingError || !existing) throw existingError ?? new Error('Vendor not found');

  const normalized = normalizeInput({
    provider_name: input.provider_name ?? existing.provider_name,
    product_type: input.product_type ?? existing.product_type,
    category: (input.category ?? existing.category) as AIVendorCategory,
    source_type: (input.source_type ?? existing.source_type) as AIVendorSourceType,
    plan_name: input.plan_name ?? existing.plan_name,
    account_label: input.account_label ?? existing.account_label,
    spend_current_period: input.spend_current_period ?? existing.spend_current_period,
    budget_limit: input.budget_limit ?? existing.budget_limit,
    remaining_budget: input.remaining_budget ?? existing.remaining_budget,
    remaining_credits: input.remaining_credits ?? existing.remaining_credits,
    estimated_remaining_capacity: input.estimated_remaining_capacity ?? existing.estimated_remaining_capacity,
    renewal_at: input.renewal_at ?? existing.renewal_at,
    provider_url: input.provider_url ?? existing.provider_url,
    notes: input.notes ?? existing.notes,
    no_overage_allowed: input.no_overage_allowed ?? existing.no_overage_allowed,
    provider_key: input.provider_key ?? existing.provider_key,
  });

  const derived = buildVendorView({
    ...(existing as AIVendorAccount),
    ...normalized,
    updated_at: new Date().toISOString(),
    metadata: (existing.metadata ?? {}) as Record<string, unknown>,
    sync_error: existing.sync_error,
  });

  const { data, error } = await supabase
    .from('ai_vendor_accounts')
    .update({
      ...normalized,
      status: derived.status,
      confidence_level: derived.confidence_level,
    })
    .eq('id', vendorId)
    .select('*')
    .single();

  if (error) throw error;

  await supabase.from('ai_vendor_spend_snapshots').insert({
    vendor_account_id: data.id,
    amount: data.spend_current_period ?? 0,
    source_type: data.source_type,
    notes: 'Vendor update snapshot',
  });

  return data as AIVendorAccount;
}

export async function getOpsDashboardData(supabase: SupabaseClient): Promise<AIOpsDashboardData> {
  const [vendors, usageSummaryResult] = await Promise.all([
    listVendorAccounts(supabase),
    supabase
      .from('ai_usage_log')
      .select('provider, total_tokens, cost_usd')
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .eq('status', 'success'),
  ]);

  const vendorViews = vendors.map((vendor) => buildVendorView(vendor));
  const alerts = computeOpsAlerts(vendorViews);
  const recommendation = recommendVendor(vendorViews);
  const renewals = vendorViews
    .filter((vendor) => vendor.renewal_at)
    .sort((a, b) => new Date(a.renewal_at!).getTime() - new Date(b.renewal_at!).getTime())
    .slice(0, 6)
    .map((vendor) => ({
      vendorAccountId: vendor.id,
      vendorName: vendor.provider_name,
      renewalAt: vendor.renewal_at!,
      sourceType: vendor.source_type,
    }));

  const usageRows = usageSummaryResult.data ?? [];
  const trackedAiUsage = usageRows.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  const manualAiSpend = vendorViews
    .filter((vendor) => vendor.category === 'ai_subscription')
    .reduce((sum, vendor) => sum + (vendor.spend_current_period ?? 0), 0);
  const trackedSoftwareSpendCurrentPeriod = vendorViews
    .filter((vendor) => vendor.category !== 'ai_subscription' && vendor.category !== 'ai_api')
    .reduce((sum, vendor) => sum + (vendor.spend_current_period ?? 0), 0);

  return {
    summary: {
      aiSpendCurrentPeriod: trackedAiUsage + manualAiSpend,
      trackedSoftwareSpendCurrentPeriod,
      totalTrackedSpend: trackedAiUsage + manualAiSpend + trackedSoftwareSpendCurrentPeriod,
      activeAlertCount: alerts.length,
      renewalCount: renewals.length,
    },
    recommendation,
    vendors: vendorViews,
    alerts,
    renewals,
  };
}
