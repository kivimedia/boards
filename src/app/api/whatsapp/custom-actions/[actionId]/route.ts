import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { updateCustomAction, deleteCustomAction } from '@/lib/whatsapp-advanced';

interface Params {
  params: { actionId: string };
}

interface UpdateCustomActionBody {
  keyword?: string;
  label?: string;
  action_type?: string;
  action_config?: Record<string, unknown>;
  response_template?: string;
  is_active?: boolean;
}

/**
 * PATCH /api/whatsapp/custom-actions/[actionId]
 * Update a custom WhatsApp action.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateCustomActionBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const { actionId } = params;

  const updates: Record<string, unknown> = {};
  if (parsed.body.keyword !== undefined) updates.keyword = parsed.body.keyword.trim().toLowerCase();
  if (parsed.body.label !== undefined) updates.label = parsed.body.label;
  if (parsed.body.action_type !== undefined) updates.action_type = parsed.body.action_type;
  if (parsed.body.action_config !== undefined) updates.action_config = parsed.body.action_config;
  if (parsed.body.response_template !== undefined) updates.response_template = parsed.body.response_template;
  if (parsed.body.is_active !== undefined) updates.is_active = parsed.body.is_active;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const action = await updateCustomAction(supabase, actionId, updates);

  if (!action) return errorResponse('Custom action not found', 404);
  return successResponse(action);
}

/**
 * DELETE /api/whatsapp/custom-actions/[actionId]
 * Delete a custom WhatsApp action.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { actionId } = params;

  await deleteCustomAction(supabase, actionId);
  return successResponse({ deleted: true });
}
