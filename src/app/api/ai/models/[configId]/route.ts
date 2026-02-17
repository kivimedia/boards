import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { AIProvider } from '@/lib/types';

const VALID_PROVIDERS: AIProvider[] = ['anthropic', 'openai', 'google', 'browserless'];

interface Params {
  params: { configId: string };
}

interface UpdateModelConfigBody {
  provider?: AIProvider;
  model_id?: string;
  temperature?: number;
  max_tokens?: number;
  is_active?: boolean;
}

/**
 * PUT /api/ai/models/[configId]
 * Update a model configuration.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateModelConfigBody>(request);
  if (!body.ok) return body.response;

  const { provider, model_id, temperature, max_tokens, is_active } = body.body;
  const updates: Record<string, unknown> = {};

  if (provider !== undefined) {
    if (!VALID_PROVIDERS.includes(provider)) {
      return errorResponse(`Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`);
    }
    updates.provider = provider;
  }
  if (model_id !== undefined) {
    if (!model_id.trim()) return errorResponse('model_id cannot be empty');
    updates.model_id = model_id.trim();
  }
  if (temperature !== undefined) {
    if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
      return errorResponse('temperature must be a number between 0 and 2');
    }
    updates.temperature = temperature;
  }
  if (max_tokens !== undefined) {
    if (typeof max_tokens !== 'number' || max_tokens < 1) {
      return errorResponse('max_tokens must be a positive number');
    }
    updates.max_tokens = max_tokens;
  }
  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') return errorResponse('is_active must be a boolean');
    updates.is_active = is_active;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { supabase } = auth.ctx;
  const { configId } = params;

  const { data, error } = await supabase
    .from('ai_model_config')
    .update(updates)
    .eq('id', configId)
    .select()
    .single();

  if (error) return errorResponse('Model config not found', 404);
  return successResponse(data);
}

/**
 * DELETE /api/ai/models/[configId]
 * Delete a model configuration.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { configId } = params;

  const { error } = await supabase
    .from('ai_model_config')
    .delete()
    .eq('id', configId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
