import { NextRequest } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { UserRole } from '@/lib/types';
import { ALL_ROLES, canManageMembers } from '@/lib/permissions';

interface Params {
  params: { id: string; memberId: string };
}

/**
 * Helper to verify the requesting user has manage-members permissions for this board.
 */
async function verifyManagePermission(supabase: SupabaseClient, boardId: string, userId: string) {
  const { data: currentMembership } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .single();

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('user_role, role')
    .eq('id', userId)
    .single();

  const globalRole = (currentProfile?.user_role || currentProfile?.role || 'member') as UserRole;
  const effectiveRole = currentMembership?.role || globalRole;

  return canManageMembers(effectiveRole as UserRole) || globalRole === 'admin';
}

interface UpdateMemberBody {
  role: UserRole;
}

/**
 * PATCH /api/boards/[id]/members/[memberId]
 * Update a board member's role.
 * Body: { role: UserRole }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id: boardId, memberId } = params;

  const hasPermission = await verifyManagePermission(supabase, boardId, userId);
  if (!hasPermission) {
    return errorResponse('Forbidden: Insufficient permissions to manage members', 403);
  }

  const body = await parseBody<UpdateMemberBody>(request);
  if (!body.ok) return body.response;

  const { role } = body.body;

  if (!role) {
    return errorResponse('role is required');
  }

  if (!ALL_ROLES.includes(role)) {
    return errorResponse(`Invalid role. Must be one of: ${ALL_ROLES.join(', ')}`);
  }

  // Verify the member exists on this board
  const { data: existingMember } = await supabase
    .from('board_members')
    .select('*')
    .eq('id', memberId)
    .eq('board_id', boardId)
    .single();

  if (!existingMember) {
    return errorResponse('Board member not found', 404);
  }

  const { data, error } = await supabase
    .from('board_members')
    .update({ role })
    .eq('id', memberId)
    .eq('board_id', boardId)
    .select('*, profile:profiles(*)')
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse(data);
}

/**
 * DELETE /api/boards/[id]/members/[memberId]
 * Remove a board member.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id: boardId, memberId } = params;

  const hasPermission = await verifyManagePermission(supabase, boardId, userId);
  if (!hasPermission) {
    return errorResponse('Forbidden: Insufficient permissions to manage members', 403);
  }

  // Verify the member exists on this board
  const { data: existingMember } = await supabase
    .from('board_members')
    .select('*')
    .eq('id', memberId)
    .eq('board_id', boardId)
    .single();

  if (!existingMember) {
    return errorResponse('Board member not found', 404);
  }

  const { error } = await supabase
    .from('board_members')
    .delete()
    .eq('id', memberId)
    .eq('board_id', boardId);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse(null);
}
