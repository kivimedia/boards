import { SupabaseClient } from '@supabase/supabase-js';
import { decryptFromHex } from '../encryption';

// ============================================================================
// EMAIL DISCOVERY — Hunter.io + Snov.io integration
// ============================================================================

export interface SnovLinkedInEnrichmentResult {
  linkedin_url: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  location: string | null;
  industry: string | null;
  company: string | null;
  domain: string | null;
  title: string | null;
}

interface DiscoveryResult {
  email: string | null;
  confidence: number;
  source: 'hunter' | 'snov' | 'none';
  verified: boolean;
}

/**
 * Get Hunter.io API key from integration configs.
 */
async function getHunterKey(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from('pga_integration_configs')
    .select('api_key_encrypted')
    .eq('service', 'hunter')
    .eq('is_active', true)
    .maybeSingle();

  if (!data?.api_key_encrypted) return null;
  try {
    return decryptFromHex(data.api_key_encrypted);
  } catch {
    return null;
  }
}

/**
 * Get Snov.io credentials from integration configs.
 * Expects api_key format: "client_id:client_secret"
 */
async function getSnovCredentials(
  supabase: SupabaseClient
): Promise<{ clientId: string; clientSecret: string } | null> {
  const { data } = await supabase
    .from('pga_integration_configs')
    .select('api_key_encrypted')
    .eq('service', 'snov')
    .eq('is_active', true)
    .maybeSingle();

  if (!data?.api_key_encrypted) return null;
  try {
    const raw = decryptFromHex(data.api_key_encrypted);
    const [clientId, clientSecret] = raw.split(':');
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  } catch {
    return null;
  }
}

/**
 * Get Snov.io access token.
 */
async function getSnovToken(clientId: string, clientSecret: string): Promise<string | null> {
  const res = await fetch('https://api.snov.io/v1/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

/**
 * Find email via Hunter.io (email finder API).
 */
async function findEmailViaHunter(
  apiKey: string,
  params: { firstName: string; lastName: string; domain?: string; company?: string }
): Promise<DiscoveryResult> {
  const qs = new URLSearchParams({ api_key: apiKey });
  if (params.firstName) qs.set('first_name', params.firstName);
  if (params.lastName) qs.set('last_name', params.lastName);
  if (params.domain) qs.set('domain', params.domain);
  if (params.company) qs.set('company', params.company);

  const res = await fetch(`https://api.hunter.io/v2/email-finder?${qs}`);
  if (!res.ok) {
    return { email: null, confidence: 0, source: 'hunter', verified: false };
  }

  const json = await res.json();
  const email = json.data?.email;
  const confidence = json.data?.confidence ?? 0;

  return {
    email: email || null,
    confidence,
    source: 'hunter',
    verified: confidence >= 90,
  };
}

/**
 * Verify email via Hunter.io.
 */
export async function verifyEmailViaHunter(
  supabase: SupabaseClient,
  email: string
): Promise<{ valid: boolean; status: string } | null> {
  const apiKey = await getHunterKey(supabase);
  if (!apiKey) return null;

  const res = await fetch(
    `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(apiKey)}`
  );
  if (!res.ok) return null;

  const json = await res.json();
  return {
    valid: json.data?.result === 'deliverable',
    status: json.data?.result ?? 'unknown',
  };
}

/**
 * Find email via Snov.io (email finder API).
 */
async function findEmailViaSnov(
  token: string,
  params: { firstName: string; lastName: string; domain?: string }
): Promise<DiscoveryResult> {
  const res = await fetch('https://api.snov.io/v1/get-emails-from-names', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      first_name: params.firstName,
      last_name: params.lastName,
      domain: params.domain,
    }),
  });

  if (!res.ok) {
    return { email: null, confidence: 0, source: 'snov', verified: false };
  }

  const json = await res.json();
  const emails = json.data?.emails ?? json.emails ?? [];
  if (emails.length === 0) {
    return { email: null, confidence: 0, source: 'snov', verified: false };
  }

  // Pick highest-confidence email
  const best = emails.reduce((a: any, b: any) =>
    (b.confidence ?? 0) > (a.confidence ?? 0) ? b : a
  );

  return {
    email: best.email || null,
    confidence: best.confidence ?? 0,
    source: 'snov',
    verified: (best.confidence ?? 0) >= 90,
  };
}

/**
 * Discover email for a candidate using Hunter.io → Snov.io fallback.
 *
 * Priority:
 * 1. Hunter.io (name + domain)
 * 2. Snov.io (name + domain)
 * 3. Return null (flag for LinkedIn DM)
 */
export async function discoverEmail(
  supabase: SupabaseClient,
  candidate: {
    name: string;
    platform_presence?: Record<string, string>;
  }
): Promise<DiscoveryResult> {
  const nameParts = candidate.name.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Extract domain from personal website
  let domain: string | undefined;
  const website = candidate.platform_presence?.website || candidate.platform_presence?.site;
  if (website) {
    try {
      domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
      // Skip generic domains
      if (['github.com', 'linkedin.com', 'twitter.com', 'youtube.com', 'reddit.com'].includes(domain)) {
        domain = undefined;
      }
    } catch {
      // Invalid URL
    }
  }

  // 1. Try Hunter.io
  const hunterKey = await getHunterKey(supabase);
  if (hunterKey && (domain || firstName)) {
    const hunterResult = await findEmailViaHunter(hunterKey, {
      firstName,
      lastName,
      domain,
    });
    if (hunterResult.email) return hunterResult;
  }

  // 2. Try Snov.io
  const snovCreds = await getSnovCredentials(supabase);
  if (snovCreds && domain) {
    const token = await getSnovToken(snovCreds.clientId, snovCreds.clientSecret);
    if (token) {
      const snovResult = await findEmailViaSnov(token, {
        firstName,
        lastName,
        domain,
      });
      if (snovResult.email) return snovResult;
    }
  }

  // 3. No email found
  return { email: null, confidence: 0, source: 'none', verified: false };
}

/**
 * Batch discover emails for multiple candidates.
 * Updates candidates in the database with found emails.
 */
export async function batchDiscoverEmails(
  supabase: SupabaseClient,
  candidateIds: string[],
  onProgress?: (message: string) => void
): Promise<{ found: number; notFound: number }> {
  let found = 0;
  let notFound = 0;

  for (const id of candidateIds) {
    const { data: candidate } = await supabase
      .from('pga_candidates')
      .select('id, name, email, platform_presence')
      .eq('id', id)
      .single();

    if (!candidate || candidate.email) {
      if (candidate?.email) found++; // Already has email
      continue;
    }

    onProgress?.(`Discovering email for ${candidate.name}...`);

    const result = await discoverEmail(supabase, candidate);

    if (result.email) {
      await supabase
        .from('pga_candidates')
        .update({
          email: result.email,
          email_verified: result.verified,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      found++;
      onProgress?.(`Found: ${result.email} (${result.source}, ${result.confidence}% confidence)`);
    } else {
      notFound++;
      onProgress?.(`No email found for ${candidate.name} — flagged for LinkedIn DM`);

      // Update contact method to LinkedIn DM if no email found
      await supabase
        .from('pga_candidates')
        .update({
          contact_method: 'linkedin_dm',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
  }

  return { found, notFound };
}

// ============================================================================
// SNOV.IO LINKEDIN PROFILE ENRICHMENT (v2 API)
// ============================================================================

/**
 * Helper to split an array into chunks of a given size.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Enrich LinkedIn profiles via Snov.io v2 API.
 *
 * Uses the li-profiles-by-urls endpoint:
 * 1. POST /v2/li-profiles-by-urls/start with up to 10 LinkedIn URLs
 * 2. Poll GET /v2/li-profiles-by-urls/result?task_hash=X until complete
 *
 * Cost: 1 Snov credit per URL that returns data.
 * Rate limit: 60 requests/minute.
 */
export async function enrichLinkedInProfiles(
  supabase: SupabaseClient,
  linkedinUrls: string[],
  onProgress?: (message: string) => void
): Promise<SnovLinkedInEnrichmentResult[]> {
  const creds = await getSnovCredentials(supabase);
  if (!creds) throw new Error('Snov.io not configured. Go to Settings > Podcast to add credentials.');
  const token = await getSnovToken(creds.clientId, creds.clientSecret);
  if (!token) throw new Error('Failed to authenticate with Snov.io. Check your client_id:client_secret.');

  const batches = chunk(linkedinUrls, 10);
  const allResults: SnovLinkedInEnrichmentResult[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    onProgress?.(`Enriching batch ${batchIdx + 1}/${batches.length} (${batch.length} profiles)...`);

    // Build form data with urls[] params
    const body: Record<string, string> = {};
    batch.forEach((url, i) => {
      body[`urls[${i}]`] = url;
    });

    const startRes = await fetch('https://api.snov.io/v2/li-profiles-by-urls/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!startRes.ok) {
      const errText = await startRes.text().catch(() => 'unknown');
      onProgress?.(`Snov.io enrichment failed (${startRes.status}): ${errText}`);
      continue;
    }

    const startData = await startRes.json();
    const taskHash = startData.task_hash || startData.data?.task_hash;

    if (!taskHash) {
      onProgress?.('Snov.io returned no task_hash. Skipping batch.');
      continue;
    }

    // Poll for results with exponential backoff
    let pollDelay = 3000;
    const maxPolls = 20;
    let completed = false;

    for (let poll = 0; poll < maxPolls; poll++) {
      await new Promise((r) => setTimeout(r, pollDelay));

      const resultRes = await fetch(
        `https://api.snov.io/v2/li-profiles-by-urls/result?task_hash=${taskHash}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!resultRes.ok) {
        onProgress?.(`Snov.io poll failed (${resultRes.status}), retrying...`);
        pollDelay = Math.min(pollDelay * 1.5, 30000);
        continue;
      }

      const resultData = await resultRes.json();
      const status = resultData.status || resultData.data?.status;

      if (status === 'completed' || status === 'finished') {
        const items = resultData.data || resultData.result || [];
        const dataArray = Array.isArray(items) ? items : (items.data || []);

        for (const item of dataArray) {
          allResults.push({
            linkedin_url: item.url || item.linkedin_url || '',
            name: item.name || [item.first_name, item.last_name].filter(Boolean).join(' ') || null,
            first_name: item.first_name || null,
            last_name: item.last_name || null,
            location: item.locality || item.location || item.country || null,
            industry: item.industry || null,
            company: item.current_company?.[0]?.name || item.company || null,
            domain: item.current_company?.[0]?.domain || item.domain || null,
            title: item.current_company?.[0]?.title || item.title || item.headline || null,
          });
        }

        onProgress?.(`Batch ${batchIdx + 1}: enriched ${dataArray.length} profiles`);
        completed = true;
        break;
      }

      if (status === 'failed' || status === 'error') {
        onProgress?.(`Snov.io enrichment failed for batch ${batchIdx + 1}`);
        completed = true;
        break;
      }

      // Still processing
      pollDelay = Math.min(pollDelay * 1.5, 30000);
      onProgress?.(`Waiting for Snov.io enrichment (poll ${poll + 1})...`);
    }

    if (!completed) {
      onProgress?.(`Snov.io enrichment timed out for batch ${batchIdx + 1}`);
    }
  }

  return allResults;
}
