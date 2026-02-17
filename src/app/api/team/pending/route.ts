import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/team/pending
 * Fetch all users with account_status = 'pending'. Requires agency_owner.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check if requester is agency_owner
  const { data: requester } = await supabase
    .from('profiles')
    .select('agency_role')
    .eq('id', userId)
    .single();

  if (requester?.agency_role !== 'agency_owner') {
    return errorResponse('Only the agency owner can view pending users', 403);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, role, agency_role, account_status, created_at')
    .eq('account_status', 'pending')
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
