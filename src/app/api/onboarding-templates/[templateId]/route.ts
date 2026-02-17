import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { OnboardingTemplateItem } from '@/lib/types';

interface Params {
  params: { templateId: string };
}

/**
 * GET /api/onboarding-templates/[templateId]
 * Get a single onboarding template.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('onboarding_templates')
    .select('*')
    .eq('id', params.templateId)
    .single();

  if (error) return errorResponse('Template not found', 404);
  return successResponse(data);
}

interface UpdateTemplateBody {
  name?: string;
  description?: string;
  template_data?: OnboardingTemplateItem[];
  is_active?: boolean;
}

/**
 * PATCH /api/onboarding-templates/[templateId]
 * Update an onboarding template.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateTemplateBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (body.body.name !== undefined) {
    if (!body.body.name.trim()) return errorResponse('Template name cannot be empty');
    updates.name = body.body.name.trim();
  }
  if (body.body.description !== undefined) updates.description = body.body.description?.trim() || null;
  if (body.body.template_data !== undefined) {
    if (!Array.isArray(body.body.template_data) || body.body.template_data.length === 0) {
      return errorResponse('template_data must be a non-empty array');
    }
    updates.template_data = body.body.template_data;
  }
  if (body.body.is_active !== undefined) updates.is_active = body.body.is_active;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('onboarding_templates')
    .update(updates)
    .eq('id', params.templateId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Template not found', 404);

  return successResponse(data);
}

/**
 * DELETE /api/onboarding-templates/[templateId]
 * Delete an onboarding template.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { error } = await supabase
    .from('onboarding_templates')
    .delete()
    .eq('id', params.templateId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
