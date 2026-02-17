import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { AgencyRole } from '@/lib/types';

interface ApproveBody {
  userId: string;
  agencyRole: AgencyRole;
}

/**
 * POST /api/team/approve
 * Approve a pending user and assign them an agency role. Requires agency_owner.
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
    return errorResponse('Only the agency owner can approve users', 403);
  }

  const body = await parseBody<ApproveBody>(request);
  if (!body.ok) return body.response;

  const { userId: targetUserId, agencyRole } = body.body;
  if (!targetUserId) return errorResponse('userId is required');
  if (!agencyRole) return errorResponse('agencyRole is required');

  const validRoles: AgencyRole[] = ['dev', 'designer', 'account_manager', 'executive_assistant', 'video_editor'];
  if (!validRoles.includes(agencyRole)) {
    return errorResponse('Invalid agency role. Cannot assign agency_owner.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      account_status: 'active',
      agency_role: agencyRole,
    })
    .eq('id', targetUserId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
