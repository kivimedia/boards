import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { UserRole } from '@/lib/types';
import { ALL_ROLES, canManageMembers } from '@/lib/permissions';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/members
 * List board members with profile join.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  // Fetch members + profiles separately (no FK from board_members→profiles)
  const [membersRes, profilesRes] = await Promise.all([
    supabase
      .from('board_members')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true }),
    supabase.from('profiles').select('*'),
  ]);

  if (membersRes.error) {
    return errorResponse(membersRes.error.message, 500);
  }

  const profilesMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
  const membersWithProfiles = (membersRes.data || []).map((m: any) => ({
    ...m,
    profile: profilesMap.get(m.user_id) || null,
  }));

  return successResponse(membersWithProfiles);
}

interface AddMemberBody {
  user_id: string;
  role: UserRole;
}

/**
 * POST /api/boards/[id]/members
 * Add a board member.
 * Body: { user_id: string, role: UserRole }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const boardId = params.id;

  // Check if requesting user can manage members on this board
  const { data: currentMembership } = await supabase
    .from('board_members')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .single();

  // Also check global role
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('user_role, role')
    .eq('id', userId)
    .single();

  const globalRole = (currentProfile?.user_role || currentProfile?.role || 'member') as UserRole;
  const effectiveRole = currentMembership?.role || globalRole;

  if (!canManageMembers(effectiveRole as UserRole) && globalRole !== 'admin') {
    return errorResponse('Forbidden: Insufficient permissions to manage members', 403);
  }

  const body = await parseBody<AddMemberBody>(request);
  if (!body.ok) return body.response;

  const { user_id, role } = body.body;

  if (!user_id || !role) {
    return errorResponse('user_id and role are required');
  }

  if (!ALL_ROLES.includes(role)) {
    return errorResponse(`Invalid role. Must be one of: ${ALL_ROLES.join(', ')}`);
  }

  // Check if user is already a member
  const { data: existingMember } = await supabase
    .from('board_members')
    .select('id')
    .eq('board_id', boardId)
    .eq('user_id', user_id)
    .single();

  if (existingMember) {
    return errorResponse('User is already a member of this board');
  }

  // Check target user exists
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user_id)
    .single();

  if (!targetProfile) {
    return errorResponse('User not found', 404);
  }

  const { data: inserted, error } = await supabase
    .from('board_members')
    .insert({
      board_id: boardId,
      user_id,
      role,
      added_by: userId,
    })
    .select('*')
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  // Attach profile manually
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user_id)
    .single();

  return successResponse({ ...inserted, profile: profile || null }, 201);
}
