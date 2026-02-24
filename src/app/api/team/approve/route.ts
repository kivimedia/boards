import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { BusinessRole } from '@/lib/types';

interface ApproveBody {
  userId: string;
  businessRole: BusinessRole;
}

/**
 * POST /api/team/approve
 * Approve a pending user and assign them a business role. Requires owner.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check if requester is owner
  const { data: requester } = await supabase
    .from('profiles')
    .select('agency_role')
    .eq('id', userId)
    .single();

  if (requester?.agency_role !== 'owner') {
    return errorResponse('Only the owner can approve users', 403);
  }

  const body = await parseBody<ApproveBody>(request);
  if (!body.ok) return body.response;

  const { userId: targetUserId, businessRole } = body.body;
  if (!targetUserId) return errorResponse('userId is required');
  if (!businessRole) return errorResponse('businessRole is required');

  const validRoles: BusinessRole[] = ['owner', 'va'];
  if (!validRoles.includes(businessRole)) {
    return errorResponse('Invalid role. Must be owner or va.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      account_status: 'active',
      agency_role: businessRole,
    })
    .eq('id', targetUserId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
