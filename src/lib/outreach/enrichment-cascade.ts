/**
 * Enrichment Cascade - 4-tier waterfall for lead enrichment
 *
 * Tier 1: Company URL from import (free)
 * Tier 2: Hunter.io domain search + email finder
 * Tier 3: Snov.io LinkedIn enrichment + email search
 * Tier 4: SerpAPI Google search for website discovery (last resort)
 *
 * Reuses existing functions from email-discovery.ts
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { LILead } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface EnrichmentResult {
  website: string | null;
  website_source: string | null;
  email: string | null;
  email_source: string | null;
  email_verified: boolean;
  enrichment_tier: number;
  enrichment_data: Record<string, unknown>;
  cost_events: CostEvent[];
  errors: string[];
}

interface CostEvent {
  service_name: 'hunter' | 'snov' | 'serpapi' | 'anthropic' | 'scrapling';
  operation: string;
  credits_used: number;
  cost_usd: number;
  success: boolean;
  error_message?: string;
}

interface ApiKeys {
  hunterKey: string | null;
  snovClientId: string | null;
  snovClientSecret: string | null;
  serpApiKey: string | null;
}

// ============================================================================
// MAIN CASCADE
// ============================================================================

export async function enrichLead(
  supabase: SupabaseClient,
  lead: LILead,
  apiKeys: ApiKeys,
  startTier: number = 0
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    website: lead.website || null,
    website_source: lead.website_source || null,
    email: lead.email || null,
    email_source: lead.email_source || null,
    email_verified: lead.email_verified || false,
    enrichment_tier: lead.enrichment_tier || 0,
    enrichment_data: { ...(lead.enrichment_data || {}) },
    cost_events: [],
    errors: [],
  };

  // Tier 1: Company URL from import (free)
  if (startTier <= 1 && !result.website) {
    const tier1 = enrichTier1(lead);
    if (tier1.website) {
      result.website = tier1.website;
      result.website_source = 'import';
      result.enrichment_tier = 1;
    }
  }

  // Tier 2: Hunter.io
  if (startTier <= 2 && !result.website && apiKeys.hunterKey) {
    try {
      const tier2 = await enrichTier2(lead, apiKeys.hunterKey);
      result.cost_events.push(...tier2.costs);

      if (tier2.website) {
        result.website = tier2.website;
        result.website_source = 'hunter';
        result.enrichment_tier = 2;
      }
      if (tier2.email) {
        result.email = tier2.email;
        result.email_source = 'hunter';
        result.email_verified = tier2.email_verified;
      }
      if (tier2.data) {
        result.enrichment_data = { ...result.enrichment_data, ...tier2.data };
      }
    } catch (err) {
      result.errors.push(`Tier 2 (Hunter): ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Tier 3: Snov.io
  if (startTier <= 3 && !result.website && apiKeys.snovClientId && apiKeys.snovClientSecret) {
    try {
      const tier3 = await enrichTier3(lead, apiKeys.snovClientId, apiKeys.snovClientSecret);
      result.cost_events.push(...tier3.costs);

      if (tier3.website) {
        result.website = tier3.website;
        result.website_source = 'snov';
        result.enrichment_tier = 3;
      }
      if (tier3.email && !result.email) {
        result.email = tier3.email;
        result.email_source = 'snov';
        result.email_verified = tier3.email_verified;
      }
      if (tier3.data) {
        result.enrichment_data = { ...result.enrichment_data, ...tier3.data };
      }
    } catch (err) {
      result.errors.push(`Tier 3 (Snov): ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Tier 4: SerpAPI (last resort)
  if (startTier <= 4 && !result.website && apiKeys.serpApiKey) {
    try {
      const tier4 = await enrichTier4(lead, apiKeys.serpApiKey);
      result.cost_events.push(...tier4.costs);

      if (tier4.website) {
        result.website = tier4.website;
        result.website_source = 'serpapi';
        result.enrichment_tier = 4;
      }
      if (tier4.data) {
        result.enrichment_data = { ...result.enrichment_data, ...tier4.data };
      }
    } catch (err) {
      result.errors.push(`Tier 4 (SerpAPI): ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // Update enrichment tier to highest attempted
  if (!result.website) {
    result.enrichment_tier = Math.max(result.enrichment_tier, startTier <= 4 ? 4 : startTier);
  }

  return result;
}

// ============================================================================
// TIER 1: Company URL from import
// ============================================================================

function enrichTier1(lead: LILead): { website: string | null } {
  if (!lead.company_url) return { website: null };

  // Skip generic social media links
  const genericDomains = ['facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'youtube.com', 'tiktok.com'];
  try {
    const hostname = new URL(lead.company_url.startsWith('http') ? lead.company_url : `https://${lead.company_url}`).hostname.toLowerCase();
    if (genericDomains.some(d => hostname.includes(d))) {
      return { website: null };
    }
    return { website: lead.company_url };
  } catch {
    return { website: null };
  }
}

// ============================================================================
// TIER 2: Hunter.io
// ============================================================================

interface TierResult {
  website: string | null;
  email: string | null;
  email_verified: boolean;
  data: Record<string, unknown> | null;
  costs: CostEvent[];
}

async function enrichTier2(lead: LILead, apiKey: string): Promise<TierResult> {
  const costs: CostEvent[] = [];
  let website: string | null = null;
  let email: string | null = null;
  let emailVerified = false;
  let data: Record<string, unknown> | null = null;

  // Try domain search if we have company name
  if (lead.company_name) {
    try {
      const qs = new URLSearchParams({
        api_key: apiKey,
        company: lead.company_name,
      });
      const res = await fetch(`https://api.hunter.io/v2/domain-search?${qs}`);
      costs.push({
        service_name: 'hunter',
        operation: 'domain_search',
        credits_used: 1,
        cost_usd: 0.10,
        success: res.ok,
        error_message: res.ok ? undefined : `HTTP ${res.status}`,
      });

      if (res.ok) {
        const json = await res.json();
        if (json.data?.domain) {
          website = `https://${json.data.domain}`;
          data = { hunter_domain: json.data.domain, hunter_organization: json.data.organization };
        }
      }
    } catch (err) {
      costs.push({
        service_name: 'hunter',
        operation: 'domain_search',
        credits_used: 0,
        cost_usd: 0,
        success: false,
        error_message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  // Try email finder if we have enough info
  if (lead.first_name && lead.last_name) {
    const domain = website ? new URL(website).hostname : undefined;
    if (domain || lead.company_name) {
      try {
        const qs = new URLSearchParams({ api_key: apiKey });
        if (lead.first_name) qs.set('first_name', lead.first_name);
        if (lead.last_name) qs.set('last_name', lead.last_name);
        if (domain) qs.set('domain', domain);
        if (lead.company_name && !domain) qs.set('company', lead.company_name);

        const res = await fetch(`https://api.hunter.io/v2/email-finder?${qs}`);
        costs.push({
          service_name: 'hunter',
          operation: 'email_finder',
          credits_used: 1,
          cost_usd: 0.10,
          success: res.ok,
          error_message: res.ok ? undefined : `HTTP ${res.status}`,
        });

        if (res.ok) {
          const json = await res.json();
          if (json.data?.email) {
            email = json.data.email;
            emailVerified = json.data.verification?.status === 'valid';
          }
        }
      } catch (err) {
        costs.push({
          service_name: 'hunter',
          operation: 'email_finder',
          credits_used: 0,
          cost_usd: 0,
          success: false,
          error_message: err instanceof Error ? err.message : 'Network error',
        });
      }
    }
  }

  return { website, email, email_verified: emailVerified, data, costs };
}

// ============================================================================
// TIER 3: Snov.io
// ============================================================================

async function enrichTier3(
  lead: LILead,
  clientId: string,
  clientSecret: string
): Promise<TierResult> {
  const costs: CostEvent[] = [];
  let website: string | null = null;
  let email: string | null = null;
  let emailVerified = false;
  let data: Record<string, unknown> | null = null;

  // Get access token
  const tokenRes = await fetch('https://api.snov.io/v1/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });

  if (!tokenRes.ok) {
    costs.push({ service_name: 'snov', operation: 'auth', credits_used: 0, cost_usd: 0, success: false, error_message: 'Auth failed' });
    return { website: null, email: null, email_verified: false, data: null, costs };
  }

  const { access_token } = await tokenRes.json();

  // LinkedIn enrichment
  if (lead.linkedin_url) {
    try {
      const res = await fetch('https://api.snov.io/v2/linkedin-profiles-by-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
        body: JSON.stringify({ urls: [lead.linkedin_url] }),
      });

      costs.push({
        service_name: 'snov',
        operation: 'linkedin_enrichment',
        credits_used: 1,
        cost_usd: 0.04,
        success: res.ok,
        error_message: res.ok ? undefined : `HTTP ${res.status}`,
      });

      if (res.ok) {
        const json = await res.json();
        const profile = json.data?.[0];
        if (profile) {
          data = {
            snov_name: profile.name,
            snov_title: profile.currentJobTitle,
            snov_company: profile.currentCompanyName,
            snov_location: profile.locality,
            snov_industry: profile.industry,
          };

          // Extract domain from company
          if (profile.currentCompanyUrl) {
            const url = profile.currentCompanyUrl;
            const genericDomains = ['facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com'];
            try {
              const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
              if (!genericDomains.some(d => hostname.includes(d))) {
                website = url.startsWith('http') ? url : `https://${url}`;
              }
            } catch { /* skip invalid URLs */ }
          }

          // Extract email
          if (profile.emails && profile.emails.length > 0) {
            const bestEmail = profile.emails.find((e: { status: string }) => e.status === 'valid') || profile.emails[0];
            email = bestEmail.email || bestEmail;
            emailVerified = bestEmail.status === 'valid';
          }
        }
      }
    } catch (err) {
      costs.push({
        service_name: 'snov',
        operation: 'linkedin_enrichment',
        credits_used: 0,
        cost_usd: 0,
        success: false,
        error_message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  return { website, email, email_verified: emailVerified, data, costs };
}

// ============================================================================
// TIER 4: SerpAPI (Google Search)
// ============================================================================

async function enrichTier4(lead: LILead, apiKey: string): Promise<TierResult> {
  const costs: CostEvent[] = [];
  let website: string | null = null;
  let data: Record<string, unknown> | null = null;

  // Build search query
  const query = `"${lead.full_name}" magician OR "kids entertainer" site`;

  try {
    const qs = new URLSearchParams({
      api_key: apiKey,
      q: query,
      num: '5',
      engine: 'google',
    });

    const res = await fetch(`https://serpapi.com/search?${qs}`);
    costs.push({
      service_name: 'serpapi',
      operation: 'google_search',
      credits_used: 1,
      cost_usd: 0.01,
      success: res.ok,
      error_message: res.ok ? undefined : `HTTP ${res.status}`,
    });

    if (res.ok) {
      const json = await res.json();
      const organicResults = json.organic_results || [];

      // Find the most relevant result that looks like a personal/business website
      const genericDomains = [
        'linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com',
        'x.com', 'youtube.com', 'tiktok.com', 'yelp.com', 'thumbtack.com',
        'gigsalad.com', 'thebash.com', 'wikipedia.org',
      ];

      for (const result of organicResults) {
        const link = result.link || '';
        try {
          const hostname = new URL(link).hostname.toLowerCase();
          if (!genericDomains.some(d => hostname.includes(d))) {
            // Check if the result title/snippet mentions the person's name
            const title = (result.title || '').toLowerCase();
            const snippet = (result.snippet || '').toLowerCase();
            const nameParts = lead.full_name.toLowerCase().split(' ');
            const nameMatch = nameParts.some(part => part.length > 2 && (title.includes(part) || snippet.includes(part)));

            if (nameMatch) {
              website = link;
              data = { serpapi_title: result.title, serpapi_snippet: result.snippet };
              break;
            }
          }
        } catch { /* skip invalid URLs */ }
      }
    }
  } catch (err) {
    costs.push({
      service_name: 'serpapi',
      operation: 'google_search',
      credits_used: 0,
      cost_usd: 0,
      success: false,
      error_message: err instanceof Error ? err.message : 'Network error',
    });
  }

  return { website, email: null, email_verified: false, data, costs };
}

// ============================================================================
// BATCH ENRICHMENT
// ============================================================================

export async function enrichBatch(
  supabase: SupabaseClient,
  userId: string,
  leadIds: string[],
  apiKeys: ApiKeys
): Promise<{ enriched: number; failed: number; errors: string[] }> {
  let enriched = 0;
  let failed = 0;
  const errors: string[] = [];

  const { data: leads, error } = await supabase
    .from('li_leads')
    .select('*')
    .eq('user_id', userId)
    .in('id', leadIds)
    .is('deleted_at', null);

  if (error || !leads) {
    return { enriched: 0, failed: 0, errors: [error?.message || 'Failed to fetch leads'] };
  }

  for (const lead of leads) {
    try {
      // Rate limiting: 200ms between calls
      await new Promise(resolve => setTimeout(resolve, 200));

      const result = await enrichLead(supabase, lead as LILead, apiKeys, lead.enrichment_tier);

      // Update lead
      const { error: updateError } = await supabase
        .from('li_leads')
        .update({
          website: result.website,
          website_source: result.website_source,
          email: result.email,
          email_source: result.email_source,
          email_verified: result.email_verified,
          enrichment_tier: result.enrichment_tier,
          enrichment_data: result.enrichment_data,
          pipeline_stage: result.website ? 'TO_QUALIFY' : lead.pipeline_stage,
        })
        .eq('id', lead.id);

      if (updateError) {
        errors.push(`Lead ${lead.id}: ${updateError.message}`);
        failed++;
        continue;
      }

      // Log cost events
      for (const cost of result.cost_events) {
        await supabase.from('li_cost_events').insert({
          user_id: userId,
          lead_id: lead.id,
          batch_id: lead.batch_id,
          ...cost,
        });
      }

      // Log pipeline transition if website was found
      if (result.website && lead.pipeline_stage !== 'TO_QUALIFY') {
        await supabase.from('li_pipeline_events').insert({
          lead_id: lead.id,
          from_stage: lead.pipeline_stage,
          to_stage: 'TO_QUALIFY',
          triggered_by: 'scout',
          notes: `Enriched via ${result.website_source} (tier ${result.enrichment_tier})`,
        });
      }

      // Handle failures - add to failed_leads if all tiers exhausted
      if (!result.website && result.enrichment_tier >= 4 && result.errors.length > 0) {
        await supabase.from('li_failed_leads').insert({
          user_id: userId,
          lead_id: lead.id,
          error_type: 'API_FAILURE',
          error_message: result.errors.join('; '),
          failed_tier: result.enrichment_tier,
          status: 'PENDING_RETRY',
          next_retry_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours
        });
      }

      enriched++;
    } catch (err) {
      errors.push(`Lead ${lead.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      failed++;
    }
  }

  return { enriched, failed, errors };
}

// ============================================================================
// API KEY RETRIEVAL
// ============================================================================

export async function getApiKeys(supabase: SupabaseClient): Promise<ApiKeys> {
  // Try to get keys from pga_integration_configs (existing pattern)
  const { data: configs } = await supabase
    .from('pga_integration_configs')
    .select('service, api_key_encrypted')
    .eq('is_active', true)
    .in('service', ['hunter', 'snov', 'serpapi']);

  const keys: ApiKeys = {
    hunterKey: null,
    snovClientId: null,
    snovClientSecret: null,
    serpApiKey: null,
  };

  if (!configs) return keys;

  for (const config of configs) {
    try {
      // Import dynamically to avoid circular deps
      const { decryptFromHex } = await import('../encryption');
      const decrypted = decryptFromHex(config.api_key_encrypted);

      switch (config.service) {
        case 'hunter':
          keys.hunterKey = decrypted;
          break;
        case 'snov': {
          const [clientId, clientSecret] = decrypted.split(':');
          keys.snovClientId = clientId || null;
          keys.snovClientSecret = clientSecret || null;
          break;
        }
        case 'serpapi':
          keys.serpApiKey = decrypted;
          break;
      }
    } catch { /* skip failed decryption */ }
  }

  return keys;
}
