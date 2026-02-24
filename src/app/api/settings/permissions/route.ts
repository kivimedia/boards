import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { isTrueAdmin, listFeaturePermissions, ADMIN_FEATURES, AdminFeatureKey } from '@/lib/feature-access';

/**
 * GET /api/settings/permissions
 * List all feature permission grants. Admin only.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const admin = await isTrueAdmin(supabase, userId);
  if (!admin) return errorResponse('Forbidden: Admin access required', 403);

  const grants = await listFeaturePermissions(supabase);
  return successResponse(grants);
}

interface CreateGrantBody {
  feature_key: string;
  granted_role?: string;
  granted_user_id?: string;
}

/**
 * POST /api/settings/permissions
 * Create a feature permission grant. Admin only.
 * Body: { feature_key, granted_role?, granted_user_id? }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const admin = await isTrueAdmin(supabase, userId);
  if (!admin) return errorResponse('Forbidden: Admin access required', 403);

  const body = await parseBody<CreateGrantBody>(request);
  if (!body.ok) return body.response;

  const { feature_key, granted_role, granted_user_id } = body.body;

  // Validate feature key
  if (!feature_key || !ADMIN_FEATURES.includes(feature_key as AdminFeatureKey)) {
    return errorResponse(`Invalid feature_key. Must be one of: ${ADMIN_FEATURES.join(', ')}`);
  }

  // Must have exactly one of role or user
  if ((!granted_role && !granted_user_id) || (granted_role && granted_user_id)) {
    return errorResponse('Provide exactly one of granted_role or granted_user_id');
  }

  const { data, error } = await supabase
    .from('feature_permissions')
    .insert({
      feature_key,
      granted_role: granted_role || null,
      granted_user_id: granted_user_id || null,
      granted_by: userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return errorResponse('This permission grant already exists', 409);
    }
    return errorResponse(error.message, 500);
  }

  return successResponse(data, 201);
}

interface DeleteGrantBody {
  id: string;
}

/**
 * DELETE /api/settings/permissions
 * Revoke a feature permission grant. Admin only.
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const admin = await isTrueAdmin(supabase, userId);
  if (!admin) return errorResponse('Forbidden: Admin access required', 403);

  const body = await parseBody<DeleteGrantBody>(request);
  if (!body.ok) return body.response;

  const { id } = body.body;
  if (!id) return errorResponse('id is required');

  const { error } = await supabase
    .from('feature_permissions')
    .delete()
    .eq('id', id);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ deleted: id });
}
