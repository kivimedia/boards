import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * PATCH /api/outreach/templates/[id] - Update a template
 *
 * Body: {
 *   template_text?: string;
 *   is_active?: boolean;
 *   prerequisite?: Record<string, unknown>;
 *   max_length?: number;
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  let body: {
    template_text?: string;
    is_active?: boolean;
    prerequisite?: Record<string, unknown>;
    max_length?: number;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const updates: Record<string, unknown> = {};
  if (body.template_text !== undefined) updates.template_text = body.template_text;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.prerequisite !== undefined) updates.prerequisite = body.prerequisite;
  if (body.max_length !== undefined) updates.max_length = body.max_length;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No fields to update', 400);
  }

  const { data, error } = await supabase
    .from('li_templates')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Template not found', 404);

  return successResponse({ template: data });
}

/**
 * DELETE /api/outreach/templates/[id] - Deactivate a template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  const { error } = await supabase
    .from('li_templates')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) return errorResponse(error.message, 500);

  return successResponse({ deactivated: true });
}
