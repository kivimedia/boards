import { SupabaseClient } from '@supabase/supabase-js';
import type {
  SSOConfig,
  SSOProviderType,
  IPWhitelistEntry,
  AuditLogEntry,
} from './types';

// ============================================================================
// SSO CONFIGURATION
// ============================================================================

export async function getSSOConfigs(
  supabase: SupabaseClient
): Promise<SSOConfig[]> {
  const { data } = await supabase
    .from('sso_configs')
    .select('*')
    .order('created_at', { ascending: false });

  return (data as SSOConfig[]) ?? [];
}

export async function getSSOConfig(
  supabase: SupabaseClient,
  configId: string
): Promise<SSOConfig | null> {
  const { data } = await supabase
    .from('sso_configs')
    .select('*')
    .eq('id', configId)
    .single();

  return data as SSOConfig | null;
}

export async function createSSOConfig(
  supabase: SupabaseClient,
  config: {
    providerType: SSOProviderType;
    name: string;
    issuerUrl?: string;
    metadataUrl?: string;
    clientId?: string;
    clientSecretEncrypted?: string;
    certificate?: string;
    attributeMapping?: Record<string, string>;
    autoProvisionUsers?: boolean;
    defaultRole?: string;
    allowedDomains?: string[];
  }
): Promise<SSOConfig | null> {
  const { data, error } = await supabase
    .from('sso_configs')
    .insert({
      provider_type: config.providerType,
      name: config.name,
      issuer_url: config.issuerUrl ?? null,
      metadata_url: config.metadataUrl ?? null,
      client_id: config.clientId ?? null,
      client_secret_encrypted: config.clientSecretEncrypted ?? null,
      certificate: config.certificate ?? null,
      attribute_mapping: config.attributeMapping ?? {},
      auto_provision_users: config.autoProvisionUsers ?? false,
      default_role: config.defaultRole ?? 'member',
      allowed_domains: config.allowedDomains ?? [],
    })
    .select()
    .single();

  if (error) return null;
  return data as SSOConfig;
}

export async function updateSSOConfig(
  supabase: SupabaseClient,
  configId: string,
  updates: Partial<
    Pick<
      SSOConfig,
      | 'name'
      | 'issuer_url'
      | 'metadata_url'
      | 'client_id'
      | 'client_secret_encrypted'
      | 'certificate'
      | 'attribute_mapping'
      | 'is_active'
      | 'auto_provision_users'
      | 'default_role'
      | 'allowed_domains'
    >
  >
): Promise<SSOConfig | null> {
  const { data, error } = await supabase
    .from('sso_configs')
    .update(updates)
    .eq('id', configId)
    .select()
    .single();

  if (error) return null;
  return data as SSOConfig;
}

export async function deleteSSOConfig(
  supabase: SupabaseClient,
  configId: string
): Promise<void> {
  await supabase.from('sso_configs').delete().eq('id', configId);
}

// ============================================================================
// IP WHITELIST
// ============================================================================

export async function getIPWhitelist(
  supabase: SupabaseClient
): Promise<IPWhitelistEntry[]> {
  const { data } = await supabase
    .from('ip_whitelist')
    .select('*')
    .order('created_at', { ascending: false });

  return (data as IPWhitelistEntry[]) ?? [];
}

export async function addIPWhitelistEntry(
  supabase: SupabaseClient,
  params: { cidr: string; description?: string; createdBy?: string }
): Promise<IPWhitelistEntry | null> {
  const { data, error } = await supabase
    .from('ip_whitelist')
    .insert({
      cidr: params.cidr,
      description: params.description ?? null,
      created_by: params.createdBy ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as IPWhitelistEntry;
}

export async function removeIPWhitelistEntry(
  supabase: SupabaseClient,
  entryId: string
): Promise<void> {
  await supabase.from('ip_whitelist').delete().eq('id', entryId);
}

export async function toggleIPWhitelistEntry(
  supabase: SupabaseClient,
  entryId: string,
  isActive: boolean
): Promise<void> {
  await supabase
    .from('ip_whitelist')
    .update({ is_active: isActive })
    .eq('id', entryId);
}

/**
 * Check if an IP address matches any active whitelist entry.
 * If no whitelist entries exist, all IPs are allowed.
 */
export async function isIPAllowed(
  supabase: SupabaseClient,
  ipAddress: string
): Promise<boolean> {
  const entries = await getIPWhitelist(supabase);
  const activeEntries = entries.filter((e) => e.is_active);

  // No whitelist = allow all
  if (activeEntries.length === 0) return true;

  return activeEntries.some((entry) => matchesCIDR(ipAddress, entry.cidr));
}

/**
 * Simple CIDR matching. Supports exact IP and /prefix notation.
 */
export function matchesCIDR(ip: string, cidr: string): boolean {
  if (!cidr.includes('/')) {
    return ip === cidr;
  }

  const [cidrIp, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);

  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const ipNum = ipToNumber(ip);
  const cidrNum = ipToNumber(cidrIp);

  if (ipNum === null || cidrNum === null) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (cidrNum & mask);
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let num = 0;
  for (const part of parts) {
    const val = parseInt(part, 10);
    if (isNaN(val) || val < 0 || val > 255) return null;
    num = (num * 256 + val) >>> 0;
  }
  return num;
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export async function createAuditEntry(
  supabase: SupabaseClient,
  entry: {
    userId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from('audit_log').insert({
    user_id: entry.userId ?? null,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId ?? null,
    old_values: entry.oldValues ?? null,
    new_values: entry.newValues ?? null,
    ip_address: entry.ipAddress ?? null,
    user_agent: entry.userAgent ?? null,
    metadata: entry.metadata ?? {},
  });
}

export async function getAuditLog(
  supabase: SupabaseClient,
  filters?: {
    userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): Promise<AuditLogEntry[]> {
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 100);

  if (filters?.userId) query = query.eq('user_id', filters.userId);
  if (filters?.action) query = query.eq('action', filters.action);
  if (filters?.resourceType) query = query.eq('resource_type', filters.resourceType);
  if (filters?.resourceId) query = query.eq('resource_id', filters.resourceId);
  if (filters?.startDate) query = query.gte('created_at', filters.startDate);
  if (filters?.endDate) query = query.lte('created_at', filters.endDate);

  const { data } = await query;
  return (data as AuditLogEntry[]) ?? [];
}

export async function getAuditLogForResource(
  supabase: SupabaseClient,
  resourceType: string,
  resourceId: string,
  limit: number = 50
): Promise<AuditLogEntry[]> {
  const { data } = await supabase
    .from('audit_log')
    .select('*')
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data as AuditLogEntry[]) ?? [];
}

// ============================================================================
// AI REVIEW CONFIDENCE
// ============================================================================

export async function setReviewConfidence(
  supabase: SupabaseClient,
  reviewId: string,
  confidenceScore: number
): Promise<void> {
  await supabase
    .from('ai_review_results')
    .update({ confidence_score: confidenceScore })
    .eq('id', reviewId);
}

export async function verifyReviewAccuracy(
  supabase: SupabaseClient,
  reviewId: string,
  verifiedBy: string,
  isAccurate: boolean
): Promise<void> {
  await supabase
    .from('ai_review_results')
    .update({
      accuracy_verified: isAccurate,
      accuracy_verified_by: verifiedBy,
      accuracy_verified_at: new Date().toISOString(),
    })
    .eq('id', reviewId);
}

export async function getReviewAccuracyStats(
  supabase: SupabaseClient,
  boardId?: string
): Promise<{ total: number; verified: number; accurate: number; accuracyRate: number }> {
  let query = supabase
    .from('ai_review_results')
    .select('accuracy_verified, card_id')
    .not('accuracy_verified', 'is', null);

  if (boardId) query = query.eq('board_id', boardId);

  const { data } = await query;
  const results = (data as { accuracy_verified: boolean }[]) ?? [];

  const total = results.length;
  const verified = results.length;
  const accurate = results.filter((r) => r.accuracy_verified === true).length;
  const accuracyRate = total > 0 ? Math.round((accurate / total) * 10000) / 100 : 0;

  return { total, verified, accurate, accuracyRate };
}
