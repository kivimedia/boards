import { SupabaseClient } from '@supabase/supabase-js';
import { isAdmin, isAgencyOwner } from '@/lib/permissions';
import { UserRole, AgencyRole } from '@/lib/types';

// ---------------------------------------------------------------------------
// Feature keys & metadata
// ---------------------------------------------------------------------------

export const ADMIN_FEATURES = [
  'user_management',
  'ai_config',
  'agent_skills',
  'whatsapp_config',
  'google_calendar',
] as const;

export type AdminFeatureKey = (typeof ADMIN_FEATURES)[number];

export const FEATURE_LABELS: Record<AdminFeatureKey, string> = {
  user_management: 'User Management',
  ai_config: 'AI Configuration',
  agent_skills: 'Agent Skills',
  whatsapp_config: 'WhatsApp Config',
  google_calendar: 'Google Calendar',
};

export const FEATURE_DESCRIPTIONS: Record<AdminFeatureKey, string> = {
  user_management: 'View and manage all users, assign global roles and permissions.',
  ai_config: 'Manage API keys, models, budgets, and usage.',
  agent_skills: 'Manage AI agent skills, quality scores, and prompts.',
  whatsapp_config: 'Configure WhatsApp Business API credentials and settings.',
  google_calendar: 'Connect Google Calendar for meeting sync, client updates, and meeting prep.',
};

/** Roles that can be delegated to (admins/agency_owners always have access) */
export const DELEGATABLE_ROLES: UserRole[] = [
  'department_lead',
  'member',
  'guest',
  'client',
  'observer',
];

// ---------------------------------------------------------------------------
// Access checks
// ---------------------------------------------------------------------------

interface ProfileRow {
  user_role?: string | null;
  role?: string | null;
  agency_role?: string | null;
}

function isAdminOrOwner(profile: ProfileRow): boolean {
  const userRole = (profile.user_role || profile.role || 'member') as UserRole;
  const agencyRole = (profile.agency_role ?? null) as AgencyRole | null;
  return isAdmin(userRole) || isAgencyOwner(agencyRole);
}

/**
 * Check if a user has access to a specific admin feature.
 * Admin and agency_owner always have full access (hardcoded).
 * Otherwise checks feature_permissions for role or user grants.
 */
export async function hasFeatureAccess(
  supabase: SupabaseClient,
  userId: string,
  featureKey: AdminFeatureKey
): Promise<boolean> {
  // 1. Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_role, role, agency_role')
    .eq('id', userId)
    .single();

  if (!profile) return false;

  // 2. Admins / agency owners always pass
  if (isAdminOrOwner(profile)) return true;

  const userRole = (profile.user_role || profile.role || 'member') as string;

  // 3. Check grants (role-based or user-specific)
  const { data: grants } = await supabase
    .from('feature_permissions')
    .select('id')
    .eq('feature_key', featureKey)
    .or(`granted_role.eq.${userRole},granted_user_id.eq.${userId}`)
    .limit(1);

  return (grants?.length ?? 0) > 0;
}

/**
 * Batch-check all admin features for a user.
 * Returns a map of feature_key -> boolean.
 * Uses a single query for efficiency.
 */
export async function getFeatureAccessMap(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<AdminFeatureKey, boolean>> {
  // Default all to false
  const result: Record<AdminFeatureKey, boolean> = {
    user_management: false,
    ai_config: false,
    agent_skills: false,
    whatsapp_config: false,
    google_calendar: false,
  };

  // 1. Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_role, role, agency_role')
    .eq('id', userId)
    .single();

  if (!profile) return result;

  // 2. Admin/owner -> all true
  if (isAdminOrOwner(profile)) {
    for (const key of ADMIN_FEATURES) {
      result[key] = true;
    }
    return result;
  }

  const userRole = (profile.user_role || profile.role || 'member') as string;

  // 3. Single query for all grants relevant to this user
  const { data: grants } = await supabase
    .from('feature_permissions')
    .select('feature_key')
    .or(`granted_role.eq.${userRole},granted_user_id.eq.${userId}`);

  if (grants) {
    for (const g of grants) {
      const key = g.feature_key as AdminFeatureKey;
      if (ADMIN_FEATURES.includes(key)) {
        result[key] = true;
      }
    }
  }

  return result;
}

/**
 * Check if the given user is a true admin (admin role or agency_owner).
 * Used to gate the permission delegation page itself.
 */
export async function isTrueAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_role, role, agency_role')
    .eq('id', userId)
    .single();

  if (!profile) return false;
  return isAdminOrOwner(profile);
}

// ---------------------------------------------------------------------------
// Admin listing helpers
// ---------------------------------------------------------------------------

export interface FeaturePermissionRow {
  id: string;
  feature_key: string;
  granted_role: string | null;
  granted_user_id: string | null;
  granted_by: string;
  created_at: string;
  granted_user_profile?: { id: string; display_name: string; avatar_url: string | null } | null;
  granted_by_profile?: { id: string; display_name: string } | null;
}

/**
 * List all feature permission grants (for admin UI).
 */
export async function listFeaturePermissions(
  supabase: SupabaseClient
): Promise<FeaturePermissionRow[]> {
  const { data, error } = await supabase
    .from('feature_permissions')
    .select(`
      id, feature_key, granted_role, granted_user_id, granted_by, created_at,
      granted_user_profile:profiles!feature_permissions_granted_user_id_fkey(id, display_name, avatar_url),
      granted_by_profile:profiles!feature_permissions_granted_by_fkey(id, display_name)
    `)
    .order('feature_key')
    .order('created_at', { ascending: true });

  if (error) {
    // Fallback: query without joins if FK names differ
    const { data: fallback } = await supabase
      .from('feature_permissions')
      .select('id, feature_key, granted_role, granted_user_id, granted_by, created_at')
      .order('feature_key')
      .order('created_at', { ascending: true });

    return (fallback || []) as FeaturePermissionRow[];
  }

  return (data || []) as unknown as FeaturePermissionRow[];
}
