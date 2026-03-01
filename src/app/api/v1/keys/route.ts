import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createApiKey, getApiKeys } from '@/lib/public-api';
import type { ApiKeyPermission } from '@/lib/types';

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
  'pageforge:read',
  'pageforge:write',
];

/**
 * GET /api/v1/keys
 * List all API keys for the authenticated user.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const keys = await getApiKeys(supabase, userId);

  return successResponse(keys);
}

interface CreateKeyBody {
  name: string;
  permissions: ApiKeyPermission[];
  rate_limit_per_minute?: number;
  rate_limit_per_day?: number;
  expires_at?: string;
}

/**
 * POST /api/v1/keys
 * Create a new API key. The raw key is returned once and cannot be retrieved again.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateKeyBody>(request);
  if (!body.ok) return body.response;

  const { name, permissions, rate_limit_per_minute, rate_limit_per_day, expires_at } = body.body;

  if (!name?.trim()) {
    return errorResponse('Name is required');
  }

  if (!Array.isArray(permissions) || permissions.length === 0) {
    return errorResponse('At least one permission is required');
  }

  const invalidPerms = permissions.filter((p) => !VALID_PERMISSIONS.includes(p));
  if (invalidPerms.length > 0) {
    return errorResponse(`Invalid permissions: ${invalidPerms.join(', ')}. Valid: ${VALID_PERMISSIONS.join(', ')}`);
  }

  if (rate_limit_per_minute !== undefined && (typeof rate_limit_per_minute !== 'number' || rate_limit_per_minute < 1)) {
    return errorResponse('rate_limit_per_minute must be a positive number');
  }

  if (rate_limit_per_day !== undefined && (typeof rate_limit_per_day !== 'number' || rate_limit_per_day < 1)) {
    return errorResponse('rate_limit_per_day must be a positive number');
  }

  const { supabase, userId } = auth.ctx;
  const result = await createApiKey(supabase, {
    name: name.trim(),
    userId,
    permissions,
    rateLimitPerMinute: rate_limit_per_minute,
    rateLimitPerDay: rate_limit_per_day,
    expiresAt: expires_at,
  });

  if (!result) {
    return errorResponse('Failed to create API key', 500);
  }

  return successResponse({
    api_key: result.apiKey,
    raw_key: result.rawKey,
    warning: 'Store this key securely. It will not be shown again.',
  }, 201);
}
