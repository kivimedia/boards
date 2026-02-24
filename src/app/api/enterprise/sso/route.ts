import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getSSOConfigs, createSSOConfig } from '@/lib/enterprise';
import type { SSOProviderType } from '@/lib/types';

/**
 * GET /api/enterprise/sso
 * List all SSO configurations.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const configs = await getSSOConfigs(supabase);
    return successResponse(configs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch SSO configs';
    return errorResponse(message, 500);
  }
}

interface CreateSSOConfigBody {
  provider_type: SSOProviderType;
  name: string;
  issuer_url?: string;
  metadata_url?: string;
  client_id?: string;
  client_secret_encrypted?: string;
  certificate?: string;
  attribute_mapping?: Record<string, string>;
  auto_provision_users?: boolean;
  default_role?: string;
  allowed_domains?: string[];
}

/**
 * POST /api/enterprise/sso
 * Create a new SSO configuration.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateSSOConfigBody>(request);
  if (!parsed.ok) return parsed.response;

  const { provider_type, name, issuer_url, metadata_url, client_id, client_secret_encrypted, certificate, attribute_mapping, auto_provision_users, default_role, allowed_domains } = parsed.body;

  if (!provider_type) return errorResponse('provider_type is required');
  if (!['saml', 'oidc'].includes(provider_type)) return errorResponse('provider_type must be saml or oidc');
  if (!name?.trim()) return errorResponse('name is required');

  const { supabase } = auth.ctx;

  const config = await createSSOConfig(supabase, {
    providerType: provider_type,
    name: name.trim(),
    issuerUrl: issuer_url,
    metadataUrl: metadata_url,
    clientId: client_id,
    clientSecretEncrypted: client_secret_encrypted,
    certificate,
    attributeMapping: attribute_mapping,
    autoProvisionUsers: auto_provision_users,
    defaultRole: default_role,
    allowedDomains: allowed_domains,
  });

  if (!config) return errorResponse('Failed to create SSO config', 500);
  return successResponse(config, 201);
}
