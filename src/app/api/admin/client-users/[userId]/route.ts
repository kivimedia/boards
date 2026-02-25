import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse, requireFeatureAccess, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { userId: string };
}

/**
 * DELETE /api/admin/client-users/[userId]
 * Delete a client auth account.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const denied = await requireFeatureAccess(auth.ctx.supabase, auth.ctx.userId, 'user_management');
  if (denied) return denied;

  // Verify the target user is actually a client
  const { data: profile } = await auth.ctx.supabase
    .from('profiles')
    .select('user_role')
    .eq('id', params.userId)
    .single();

  if (!profile) return errorResponse('User not found', 404);
  if (profile.user_role !== 'client') return errorResponse('Can only delete client users via this endpoint', 400);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return errorResponse('Server configuration error', 500);

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Delete profile first (cascade will clean up)
  await auth.ctx.supabase.from('profiles').delete().eq('id', params.userId);

  // Delete auth user
  const { error } = await adminClient.auth.admin.deleteUser(params.userId);
  if (error) return errorResponse(error.message, 500);

  return successResponse(null);
}

interface ResetPasswordBody {
  newPassword: string;
}

/**
 * PATCH /api/admin/client-users/[userId]
 * Reset a client user's password.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const denied = await requireFeatureAccess(auth.ctx.supabase, auth.ctx.userId, 'user_management');
  if (denied) return denied;

  const body = await parseBody<ResetPasswordBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.newPassword || body.body.newPassword.length < 6) {
    return errorResponse('Password must be at least 6 characters');
  }

  // Verify the target user is a client
  const { data: profile } = await auth.ctx.supabase
    .from('profiles')
    .select('user_role')
    .eq('id', params.userId)
    .single();

  if (!profile) return errorResponse('User not found', 404);
  if (profile.user_role !== 'client') return errorResponse('Can only reset client user passwords via this endpoint', 400);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return errorResponse('Server configuration error', 500);

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { error } = await adminClient.auth.admin.updateUserById(params.userId, {
    password: body.body.newPassword,
  });

  if (error) return errorResponse(error.message, 500);

  return successResponse({ message: 'Password reset successfully' });
}
