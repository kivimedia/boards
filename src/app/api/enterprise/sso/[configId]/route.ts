import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getSSOConfig, updateSSOConfig, deleteSSOConfig } from '@/lib/enterprise';

interface Params {
  params: { configId: string };
}

/**
 * GET /api/enterprise/sso/[configId]
 * Get a single SSO configuration by ID.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { configId } = params;

  const config = await getSSOConfig(supabase, configId);
  if (!config) return errorResponse('SSO config not found', 404);

  return successResponse(config);
}

interface UpdateSSOConfigBody {
  name?: string;
  issuer_url?: string;
  metadata_url?: string;
  client_id?: string;
  client_secret_encrypted?: string;
  certificate?: string;
  attribute_mapping?: Record<string, string>;
  is_active?: boolean;
  auto_provision_users?: boolean;
  default_role?: string;
  allowed_domains?: string[];
}

/**
 * PATCH /api/enterprise/sso/[configId]
 * Update an SSO configuration.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateSSOConfigBody>(request);
  if (!parsed.ok) return parsed.response;

  const { configId } = params;
  const body = parsed.body;

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return errorResponse('name cannot be empty');
    updates.name = body.name.trim();
  }
  if (body.issuer_url !== undefined) updates.issuer_url = body.issuer_url;
  if (body.metadata_url !== undefined) updates.metadata_url = body.metadata_url;
  if (body.client_id !== undefined) updates.client_id = body.client_id;
  if (body.client_secret_encrypted !== undefined) updates.client_secret_encrypted = body.client_secret_encrypted;
  if (body.certificate !== undefined) updates.certificate = body.certificate;
  if (body.attribute_mapping !== undefined) updates.attribute_mapping = body.attribute_mapping;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.auto_provision_users !== undefined) updates.auto_provision_users = body.auto_provision_users;
  if (body.default_role !== undefined) updates.default_role = body.default_role;
  if (body.allowed_domains !== undefined) updates.allowed_domains = body.allowed_domains;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { supabase } = auth.ctx;

  const updated = await updateSSOConfig(supabase, configId, updates);
  if (!updated) return errorResponse('SSO config not found', 404);

  return successResponse(updated);
}

/**
 * DELETE /api/enterprise/sso/[configId]
 * Delete an SSO configuration.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { configId } = params;

  await deleteSSOConfig(supabase, configId);
  return successResponse({ deleted: true });
}
