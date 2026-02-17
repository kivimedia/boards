import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { encryptToHex } from '@/lib/encryption';
import type { AIProvider } from '@/lib/types';

const VALID_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'google', 'browserless'];

/**
 * GET /api/ai/keys
 * List all API keys (never returns decrypted key values).
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('ai_api_keys')
    .select('id, provider, label, is_active, last_used_at, created_by, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateKeyBody {
  provider: AIProvider;
  label: string;
  key: string;
}

/**
 * POST /api/ai/keys
 * Add a new API key. The key is encrypted before storage.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateKeyBody>(request);
  if (!body.ok) return body.response;

  const { provider, label, key } = body.body;

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return errorResponse(`Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`);
  }
  if (!label?.trim()) {
    return errorResponse('Label is required');
  }
  if (!key?.trim()) {
    return errorResponse('API key is required');
  }

  let keyEncrypted: string;
  try {
    keyEncrypted = encryptToHex(key.trim());
  } catch (err) {
    console.error('[AI Keys] Encryption failed:', err);
    return errorResponse('Failed to encrypt API key. Ensure CREDENTIALS_ENCRYPTION_KEY is configured.', 500);
  }

  const { supabase, userId } = auth.ctx;
  const { data, error } = await supabase
    .from('ai_api_keys')
    .insert({
      provider,
      label: label.trim(),
      key_encrypted: keyEncrypted,
      is_active: true,
      created_by: userId,
    })
    .select('id, provider, label, is_active, last_used_at, created_by, created_at, updated_at')
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
