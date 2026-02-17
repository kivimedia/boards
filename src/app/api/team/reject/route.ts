import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface RejectBody {
  userId: string;
}

/**
 * POST /api/team/reject
 * Reject (suspend) a pending user. Requires agency_owner.
 */
export async function POST(request: NextRequest) {
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
    return errorResponse('Only the agency owner can reject users', 403);
  }

  const body = await parseBody<RejectBody>(request);
  if (!body.ok) return body.response;

  const { userId: targetUserId } = body.body;
  if (!targetUserId) return errorResponse('userId is required');

  const { data, error } = await supabase
    .from('profiles')
    .update({ account_status: 'suspended' })
    .eq('id', targetUserId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
