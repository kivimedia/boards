import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { clientId: string; portalUserId: string };
}

/**
 * DELETE /api/clients/[clientId]/portal-users/[portalUserId]
 * Deactivate a portal user (soft-delete by setting is_active = false).
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const { error } = await supabase
      .from('client_portal_users')
      .update({ is_active: false })
      .eq('id', params.portalUserId)
      .eq('client_id', params.clientId);

    if (error) {
      return errorResponse(error.message, 500);
    }

    return successResponse({ deactivated: true });
  } catch (err) {
    return errorResponse(
      `Failed to deactivate portal user: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface UpdatePortalUserBody {
  name?: string;
  email?: string;
  isPrimary?: boolean;
}

/**
 * PATCH /api/clients/[clientId]/portal-users/[portalUserId]
 * Update a portal user's details.
 *
 * Body (all optional):
 *   name?: string
 *   email?: string
 *   isPrimary?: boolean
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdatePortalUserBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.name !== undefined) {
    if (!body.body.name.trim()) return errorResponse('name cannot be empty');
    updates.name = body.body.name.trim();
  }
  if (body.body.email !== undefined) {
    if (!body.body.email.trim()) return errorResponse('email cannot be empty');
    updates.email = body.body.email.trim();
  }
  if (body.body.isPrimary !== undefined) {
    updates.is_primary_contact = body.body.isPrimary;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  try {
    const { data, error } = await supabase
      .from('client_portal_users')
      .update(updates)
      .eq('id', params.portalUserId)
      .eq('client_id', params.clientId)
      .select()
      .single();

    if (error) {
      return errorResponse(error.message, 500);
    }

    return successResponse(data);
  } catch (err) {
    return errorResponse(
      `Failed to update portal user: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
