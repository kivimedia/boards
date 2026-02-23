import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/mentions
 * Returns all team member profiles for @mention autocomplete.
 * Uses service role to bypass RLS so all members are visible to everyone.
 */
export async function GET() {
  // Verify the caller is authenticated
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    // Fallback: use regular client (may be limited by RLS)
    const { supabase } = auth.ctx;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, role, user_role')
      .not('display_name', 'is', null)
      .order('display_name');
    if (error) return errorResponse(error.message, 500);
    return successResponse(data || []);
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  const { data, error } = await adminClient
    .from('profiles')
    .select('id, display_name, avatar_url, role, user_role')
    .not('display_name', 'is', null)
    .order('display_name');

  if (error) return errorResponse(error.message, 500);
  return successResponse(data || []);
}
