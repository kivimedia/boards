import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/team/profiles
 * Returns all profiles with their emails (from auth.users).
 * Used by MigrationWizard to populate user mapping dropdowns.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Fetch all profiles
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role')
    .order('display_name');

  if (error) return errorResponse(error.message, 500);
  if (!profiles || profiles.length === 0) return successResponse([]);

  // Use service role to get emails from auth.users
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    // Fall back: return profiles without email
    return successResponse(profiles.map((p: any) => ({ ...p, email: null })));
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  try {
    const { data: authData } = await adminClient.auth.admin.listUsers({
      perPage: 1000,
    });

    const emailMap = new Map<string, string>();
    if (authData?.users) {
      for (const u of authData.users) {
        if (u.email) emailMap.set(u.id, u.email);
      }
    }

    const enriched = profiles.map((p: any) => ({
      ...p,
      email: emailMap.get(p.id) || null,
    }));

    return successResponse(enriched);
  } catch {
    // Fall back: return profiles without email
    return successResponse(profiles.map((p: any) => ({ ...p, email: null })));
  }
}
