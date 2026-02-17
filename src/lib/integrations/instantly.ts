import { SupabaseClient } from '@supabase/supabase-js';
import { decryptFromHex } from '../encryption';

// ============================================================================
// INSTANTLY.IO — Cold email sending & tracking
// ============================================================================

const BASE_URL = 'https://api.instantly.ai/api/v1';

interface InstantlyConfig {
  apiKey: string;
  senderEmail?: string;
  dailyLimit?: number;
  warmupEnabled?: boolean;
}

/**
 * Load Instantly.io config from pga_integration_configs.
 */
export async function getInstantlyConfig(
  supabase: SupabaseClient
): Promise<InstantlyConfig | null> {
  const { data } = await supabase
    .from('pga_integration_configs')
    .select('api_key_encrypted, config, is_active')
    .eq('service', 'instantly')
    .eq('is_active', true)
    .maybeSingle();

  if (!data?.api_key_encrypted) return null;

  try {
    const apiKey = decryptFromHex(data.api_key_encrypted);
    const cfg = (data.config ?? {}) as Record<string, unknown>;
    return {
      apiKey,
      senderEmail: cfg.sender_email as string | undefined,
      dailyLimit: cfg.daily_limit as number | undefined,
      warmupEnabled: cfg.warmup_enabled as boolean | undefined,
    };
  } catch {
    console.error('[Instantly] Failed to decrypt API key');
    return null;
  }
}

/**
 * Create a campaign in Instantly.io
 */
export async function createCampaign(
  config: InstantlyConfig,
  params: {
    name: string;
    senderEmail?: string;
  }
): Promise<{ id: string; name: string } | null> {
  const res = await fetch(`${BASE_URL}/campaign/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.apiKey,
      name: params.name,
      from_email: params.senderEmail || config.senderEmail,
    }),
  });

  if (!res.ok) {
    console.error('[Instantly] Create campaign failed:', await res.text());
    return null;
  }

  return res.json();
}

/**
 * Add leads (email recipients) to a campaign.
 */
export async function addLeadsToCampaign(
  config: InstantlyConfig,
  campaignId: string,
  leads: Array<{
    email: string;
    first_name?: string;
    last_name?: string;
    custom_variables?: Record<string, string>;
  }>
): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/lead/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.apiKey,
      campaign_id: campaignId,
      skip_if_in_workspace: true,
      leads: leads.map((l) => ({
        email: l.email,
        first_name: l.first_name,
        last_name: l.last_name,
        ...l.custom_variables,
      })),
    }),
  });

  if (!res.ok) {
    console.error('[Instantly] Add leads failed:', await res.text());
    return false;
  }

  return true;
}

/**
 * Set email sequence steps for a campaign.
 */
export async function setCampaignSequence(
  config: InstantlyConfig,
  campaignId: string,
  steps: Array<{
    day: number;
    subject: string;
    body: string;
  }>
): Promise<boolean> {
  const sequences = steps.map((s, i) => ({
    step: i + 1,
    delay: s.day,
    subject: s.subject,
    body: s.body,
  }));

  const res = await fetch(`${BASE_URL}/campaign/set-sequence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.apiKey,
      campaign_id: campaignId,
      sequences: [{ steps: sequences }],
    }),
  });

  if (!res.ok) {
    console.error('[Instantly] Set sequence failed:', await res.text());
    return false;
  }

  return true;
}

/**
 * Launch a campaign (starts sending emails).
 */
export async function launchCampaign(
  config: InstantlyConfig,
  campaignId: string
): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/campaign/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.apiKey,
      campaign_id: campaignId,
    }),
  });

  if (!res.ok) {
    console.error('[Instantly] Launch campaign failed:', await res.text());
    return false;
  }

  return true;
}

/**
 * Get campaign analytics (opens, clicks, replies).
 */
export async function getCampaignAnalytics(
  config: InstantlyConfig,
  campaignId: string
): Promise<{
  emails_sent: number;
  emails_opened: number;
  links_clicked: number;
  replies: number;
} | null> {
  const res = await fetch(
    `${BASE_URL}/analytics/campaign/summary?api_key=${encodeURIComponent(config.apiKey)}&campaign_id=${encodeURIComponent(campaignId)}`
  );

  if (!res.ok) {
    console.error('[Instantly] Get analytics failed:', await res.text());
    return null;
  }

  const data = await res.json();
  return {
    emails_sent: data.sent ?? 0,
    emails_opened: data.opened ?? 0,
    links_clicked: data.link_clicked ?? 0,
    replies: data.replied ?? 0,
  };
}

/**
 * Get warmup status for sending accounts.
 */
export async function getWarmupStatus(
  config: InstantlyConfig
): Promise<Array<{ email: string; warmup_status: string; warmup_reputation: number }>> {
  const res = await fetch(
    `${BASE_URL}/account/list?api_key=${encodeURIComponent(config.apiKey)}`
  );

  if (!res.ok) return [];

  const accounts = await res.json();
  if (!Array.isArray(accounts)) return [];

  return accounts.map((a: any) => ({
    email: a.email ?? '',
    warmup_status: a.warmup_status ?? 'unknown',
    warmup_reputation: a.warmup_reputation ?? 0,
  }));
}

/**
 * Full flow: Create campaign + add lead + set sequence + launch.
 * Returns campaign ID on success.
 */
export async function sendSequenceToCandidate(
  config: InstantlyConfig,
  candidate: {
    id: string;
    name: string;
    email: string;
  },
  emails: Array<{ step: number; day: number; subject: string; body: string }>
): Promise<string | null> {
  // 1. Create campaign
  const nameParts = candidate.name.split(' ');
  const campaign = await createCampaign(config, {
    name: `PGA — ${candidate.name} — ${new Date().toISOString().slice(0, 10)}`,
  });

  if (!campaign?.id) return null;

  // 2. Add lead
  const added = await addLeadsToCampaign(config, campaign.id, [
    {
      email: candidate.email,
      first_name: nameParts[0],
      last_name: nameParts.slice(1).join(' '),
      custom_variables: { candidate_id: candidate.id },
    },
  ]);

  if (!added) return null;

  // 3. Set email sequence
  const sequenceSet = await setCampaignSequence(config, campaign.id, emails);
  if (!sequenceSet) return null;

  // 4. Launch
  const launched = await launchCampaign(config, campaign.id);
  if (!launched) return null;

  return campaign.id;
}
