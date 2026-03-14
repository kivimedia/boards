// ============================================================================
// Google Ads Account Manager - TypeScript Client
// Talks to custom FastAPI service on VPS (port 8100)
// ============================================================================

const GADS_ACCOUNT_BASE = process.env.GADS_ACCOUNT_URL || 'http://5.161.71.94:8100';
const INTERNAL_AUTH = process.env.VPS_INTERNAL_AUTH || '';

interface GadsRequestOptions {
  teamConfigId: string;
  customerId?: string;
  loginCustomerId?: string;
}

interface GadsCampaign {
  id: string;
  name: string;
  status: string;
  budget_micros: number;
  spend_30d: number;
  impressions_30d: number;
  clicks_30d: number;
  conversions_30d: number;
  ctr: number;
  cpc: number;
}

interface GadsKeyword {
  keyword: string;
  campaign: string;
  ad_group: string;
  match_type: string;
  quality_score: number | null;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  status: string;
}

interface GadsSearchTerm {
  search_term: string;
  keyword: string;
  campaign: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  has_organic_content: boolean | null;
}

interface GadsBudget {
  campaign: string;
  daily_budget: number;
  spend_today: number;
  spend_30d: number;
  utilization_pct: number;
  recommendation: string | null;
}

async function gadsAccountFetch<T>(
  path: string,
  opts: GadsRequestOptions,
  params?: Record<string, string>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const url = new URL(path, GADS_ACCOUNT_BASE);
    url.searchParams.set('team_config_id', opts.teamConfigId);
    if (opts.customerId) url.searchParams.set('customer_id', opts.customerId);
    if (opts.loginCustomerId) url.searchParams.set('login_customer_id', opts.loginCustomerId);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      headers: {
        'X-Internal-Auth': INTERNAL_AUTH,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      return { data: null, error: `HTTP ${res.status}: ${text.slice(0, 500)}` };
    }

    const data = await res.json();
    return { data: data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function gadsAccountPost<T>(
  path: string,
  opts: GadsRequestOptions,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const url = new URL(path, GADS_ACCOUNT_BASE);
    url.searchParams.set('team_config_id', opts.teamConfigId);
    if (opts.customerId) url.searchParams.set('customer_id', opts.customerId);
    if (opts.loginCustomerId) url.searchParams.set('login_customer_id', opts.loginCustomerId);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'X-Internal-Auth': INTERNAL_AUTH,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      return { data: null, error: `HTTP ${res.status}: ${text.slice(0, 500)}` };
    }

    const data = await res.json();
    return { data: data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function listCampaigns(opts: GadsRequestOptions) {
  return gadsAccountFetch<GadsCampaign[]>('/campaigns', opts);
}

export async function getKeywordPerformance(
  opts: GadsRequestOptions,
  campaignId?: string
) {
  const params: Record<string, string> = {};
  if (campaignId) params.campaign_id = campaignId;
  return gadsAccountFetch<GadsKeyword[]>('/keywords', opts, params);
}

export async function getSearchTermsReport(
  opts: GadsRequestOptions,
  campaignId?: string,
  days?: number
) {
  const params: Record<string, string> = {};
  if (campaignId) params.campaign_id = campaignId;
  if (days) params.days = String(days);
  return gadsAccountFetch<GadsSearchTerm[]>('/search-terms', opts, params);
}

export async function getBudgetOverview(opts: GadsRequestOptions) {
  return gadsAccountFetch<GadsBudget[]>('/budgets', opts);
}

export async function updateBudget(
  opts: GadsRequestOptions,
  campaignId: string,
  newDailyBudgetMicros: number
) {
  return gadsAccountPost<{ success: boolean; message: string }>('/budget', opts, {
    campaign_id: campaignId,
    daily_budget_micros: newDailyBudgetMicros,
  });
}

export async function updateKeywordStatus(
  opts: GadsRequestOptions,
  keywordId: string,
  status: 'ENABLED' | 'PAUSED'
) {
  return gadsAccountPost<{ success: boolean; message: string }>('/keyword-status', opts, {
    keyword_id: keywordId,
    status,
  });
}

export type {
  GadsRequestOptions,
  GadsCampaign,
  GadsKeyword,
  GadsSearchTerm,
  GadsBudget,
};
