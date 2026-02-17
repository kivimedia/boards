import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { encryptToHex } from '@/lib/encryption';
import type { PGAService } from '@/lib/types';

const VALID_SERVICES: PGAService[] = ['instantly', 'hunter', 'snov', 'calendly', 'trello'];

/**
 * GET /api/podcast/integrations
 * List all integration configs (never returns decrypted API keys).
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('pga_integration_configs')
    .select('id, service, config, is_active, created_at, updated_at')
    .order('service', { ascending: true });

  if (error) return errorResponse(error.message, 500);

  // Add has_key flag without exposing the key
  const configs = (data ?? []).map((c: any) => ({
    ...c,
    has_api_key: false, // We didn't select api_key_encrypted, so check separately
  }));

  // Check which have keys set
  const { data: keyed } = await supabase
    .from('pga_integration_configs')
    .select('service, api_key_encrypted')
    .not('api_key_encrypted', 'is', null);

  const keyedServices = new Set((keyed ?? []).map((k: any) => k.service));
  for (const c of configs) {
    c.has_api_key = keyedServices.has(c.service);
  }

  return successResponse(configs);
}

interface UpsertBody {
  service: PGAService;
  api_key?: string;
  config?: Record<string, unknown>;
  is_active?: boolean;
}

/**
 * POST /api/podcast/integrations
 * Create or update an integration config. Upserts by service name.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpsertBody>(request);
  if (!body.ok) return body.response;

  const { service, api_key, config, is_active } = body.body;

  if (!service || !VALID_SERVICES.includes(service)) {
    return errorResponse(`Invalid service. Must be one of: ${VALID_SERVICES.join(', ')}`);
  }

  const { supabase } = auth.ctx;

  // Check if config already exists
  const { data: existing } = await supabase
    .from('pga_integration_configs')
    .select('id')
    .eq('service', service)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (api_key !== undefined) {
    if (api_key.trim()) {
      try {
        updates.api_key_encrypted = encryptToHex(api_key.trim());
      } catch (err) {
        console.error('[PGA Integrations] Encryption failed:', err);
        return errorResponse('Failed to encrypt API key.', 500);
      }
    } else {
      updates.api_key_encrypted = null; // Clear key
    }
  }

  if (config !== undefined) {
    updates.config = config;
  }
  if (is_active !== undefined) {
    updates.is_active = is_active;
  }

  let result;
  if (existing) {
    // Update
    const { data, error } = await supabase
      .from('pga_integration_configs')
      .update(updates)
      .eq('id', existing.id)
      .select('id, service, config, is_active, created_at, updated_at')
      .single();

    if (error) return errorResponse(error.message, 500);
    result = data;
  } else {
    // Insert
    const { data, error } = await supabase
      .from('pga_integration_configs')
      .insert({
        service,
        ...updates,
      })
      .select('id, service, config, is_active, created_at, updated_at')
      .single();

    if (error) return errorResponse(error.message, 500);
    result = data;
  }

  return successResponse(result, existing ? 200 : 201);
}
