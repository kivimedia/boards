import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { UserRole } from '@/lib/types';
import { ALL_ROLES } from '@/lib/permissions';

/**
 * GET /api/settings/users
 * List all profiles with user_role. Admin only.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check if the requesting user is an admin
  const { data: currentProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError || !currentProfile) {
    return errorResponse('Profile not found', 404);
  }

  const userRole = currentProfile.user_role || currentProfile.role || 'member';
  if (userRole !== 'admin') {
    return errorResponse('Forbidden: Admin access required', 403);
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true });

  if (error) {
    return errorResponse(error.message, 500);
  }

  const profilesWithRole = (profiles || []).map((p) => ({
    ...p,
    user_role: p.user_role || 'member',
  }));

  return successResponse(profilesWithRole);
}

interface UpdateUserRoleBody {
  user_id: string;
  user_role: UserRole;
}

/**
 * PATCH /api/settings/users
 * Update a user's user_role. Admin only.
 * Body: { user_id: string, user_role: UserRole }
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check if the requesting user is an admin
  const { data: currentProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError || !currentProfile) {
    return errorResponse('Profile not found', 404);
  }

  const currentUserRole = currentProfile.user_role || currentProfile.role || 'member';
  if (currentUserRole !== 'admin') {
    return errorResponse('Forbidden: Admin access required', 403);
  }

  const body = await parseBody<UpdateUserRoleBody>(request);
  if (!body.ok) return body.response;

  const { user_id, user_role } = body.body;

  if (!user_id || !user_role) {
    return errorResponse('user_id and user_role are required');
  }

  if (!ALL_ROLES.includes(user_role)) {
    return errorResponse(`Invalid role. Must be one of: ${ALL_ROLES.join(', ')}`);
  }

  // Prevent admin from changing their own role
  if (user_id === userId) {
    return errorResponse('You cannot change your own role');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ user_role })
    .eq('id', user_id)
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse(data);
}
