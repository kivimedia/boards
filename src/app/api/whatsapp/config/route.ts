import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/whatsapp/config
 * Get the active WhatsApp Business API config (admin only).
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (!profile || profile.role !== 'admin') {
    return errorResponse('Admin access required', 403);
  }

  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('id, phone_number_id, webhook_verify_token, business_account_id, is_active, created_at, updated_at')
    .eq('is_active', true)
    .limit(1)
    .single();

  return successResponse({ config: config || null });
}

interface ConfigBody {
  phone_number_id: string;
  access_token?: string;
  webhook_verify_token: string;
  business_account_id?: string | null;
}

/**
 * POST /api/whatsapp/config
 * Create a new WhatsApp Business API config (admin only).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (!profile || profile.role !== 'admin') {
    return errorResponse('Admin access required', 403);
  }

  const parsed = await parseBody<ConfigBody>(request);
  if (!parsed.ok) return parsed.response;

  const { phone_number_id, access_token, webhook_verify_token, business_account_id } = parsed.body;

  if (!phone_number_id || !access_token || !webhook_verify_token) {
    return errorResponse('phone_number_id, access_token, and webhook_verify_token are required');
  }

  // Deactivate any existing config
  await supabase
    .from('whatsapp_config')
    .update({ is_active: false })
    .eq('is_active', true);

  const { data: config, error } = await supabase
    .from('whatsapp_config')
    .insert({
      phone_number_id,
      access_token,
      webhook_verify_token,
      business_account_id: business_account_id || null,
      is_active: true,
    })
    .select('id, phone_number_id, webhook_verify_token, business_account_id, is_active, created_at, updated_at')
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ config }, 201);
}

/**
 * PATCH /api/whatsapp/config
 * Update the active WhatsApp Business API config (admin only).
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (!profile || profile.role !== 'admin') {
    return errorResponse('Admin access required', 403);
  }

  const parsed = await parseBody<Partial<ConfigBody>>(request);
  if (!parsed.ok) return parsed.response;

  const { phone_number_id, access_token, webhook_verify_token, business_account_id } = parsed.body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (phone_number_id) updates.phone_number_id = phone_number_id;
  if (access_token) updates.access_token = access_token;
  if (webhook_verify_token) updates.webhook_verify_token = webhook_verify_token;
  if (business_account_id !== undefined) updates.business_account_id = business_account_id;

  if (Object.keys(updates).length <= 1) {
    return errorResponse('No fields to update');
  }

  const { data: config, error } = await supabase
    .from('whatsapp_config')
    .update(updates)
    .eq('is_active', true)
    .select('id, phone_number_id, webhook_verify_token, business_account_id, is_active, created_at, updated_at')
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  if (!config) {
    return errorResponse('No active config found', 404);
  }

  return successResponse({ config });
}
