import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { revokeApiKey, deleteApiKey } from '@/lib/public-api';
import type { ApiKeyPermission } from '@/lib/types';

interface Params {
  params: { keyId: string };
}

const VALID_PERMISSIONS: ApiKeyPermission[] = [
  'boards:read',
  'boards:write',
  'cards:read',
  'cards:write',
  'comments:read',
  'comments:write',
  'labels:read',
  'labels:write',
  'webhooks:manage',
  'users:read',
];

interface UpdateKeyBody {
  name?: string;
  permissions?: ApiKeyPermission[];
  rate_limit_per_minute?: number;
  rate_limit_per_day?: number;
}

/**
 * PATCH /api/v1/keys/[keyId]
 * Update an API key's name, permissions, or rate limits.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateKeyBody>(request);
  if (!body.ok) return body.response;

  const { name, permissions, rate_limit_per_minute, rate_limit_per_day } = body.body;
  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    if (!name.trim()) return errorResponse('Name cannot be empty');
    updates.name = name.trim();
  }

  if (permissions !== undefined) {
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return errorResponse('At least one permission is required');
    }
    const invalidPerms = permissions.filter((p) => !VALID_PERMISSIONS.includes(p));
    if (invalidPerms.length > 0) {
      return errorResponse(`Invalid permissions: ${invalidPerms.join(', ')}`);
    }
    updates.permissions = permissions;
  }

  if (rate_limit_per_minute !== undefined) {
    if (typeof rate_limit_per_minute !== 'number' || rate_limit_per_minute < 1) {
      return errorResponse('rate_limit_per_minute must be a positive number');
    }
    updates.rate_limit_per_minute = rate_limit_per_minute;
  }

  if (rate_limit_per_day !== undefined) {
    if (typeof rate_limit_per_day !== 'number' || rate_limit_per_day < 1) {
      return errorResponse('rate_limit_per_day must be a positive number');
    }
    updates.rate_limit_per_day = rate_limit_per_day;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  updates.updated_at = new Date().toISOString();

  const { supabase } = auth.ctx;
  const { keyId } = params;

  const { data, error } = await supabase
    .from('api_keys')
    .update(updates)
    .eq('id', keyId)
    .select()
    .single();

  if (error) return errorResponse('API key not found', 404);
  return successResponse(data);
}

/**
 * DELETE /api/v1/keys/[keyId]
 * Revoke and delete an API key.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { keyId } = params;

  // Revoke first (mark inactive), then delete
  await revokeApiKey(supabase, keyId);
  await deleteApiKey(supabase, keyId);

  return successResponse({ deleted: true });
}
