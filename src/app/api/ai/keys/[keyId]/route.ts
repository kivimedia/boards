import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { keyId: string };
}

interface UpdateKeyBody {
  label?: string;
  is_active?: boolean;
}

/**
 * PUT /api/ai/keys/[keyId]
 * Update an API key's label or is_active status.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateKeyBody>(request);
  if (!body.ok) return body.response;

  const { label, is_active } = body.body;
  const updates: Record<string, unknown> = {};

  if (label !== undefined) {
    if (!label.trim()) return errorResponse('Label cannot be empty');
    updates.label = label.trim();
  }
  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') return errorResponse('is_active must be a boolean');
    updates.is_active = is_active;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { supabase } = auth.ctx;
  const { keyId } = params;

  const { data, error } = await supabase
    .from('ai_api_keys')
    .update(updates)
    .eq('id', keyId)
    .select('id, provider, label, is_active, last_used_at, created_by, created_at, updated_at')
    .single();

  if (error) return errorResponse('API key not found', 404);
  return successResponse(data);
}

/**
 * DELETE /api/ai/keys/[keyId]
 * Delete an API key.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { keyId } = params;

  const { error } = await supabase
    .from('ai_api_keys')
    .delete()
    .eq('id', keyId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
