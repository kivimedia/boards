import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { updateDigestTemplate, deleteDigestTemplate } from '@/lib/whatsapp-advanced';
import type { DigestSection } from '@/lib/types';

interface Params {
  params: { templateId: string };
}

interface UpdateDigestTemplateBody {
  name?: string;
  sections?: DigestSection[];
  is_default?: boolean;
}

/**
 * PATCH /api/whatsapp/digest-templates/[templateId]
 * Update a digest template.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateDigestTemplateBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const { templateId } = params;

  const updates: Record<string, unknown> = {};
  if (parsed.body.name !== undefined) updates.name = parsed.body.name.trim();
  if (parsed.body.sections !== undefined) updates.sections = parsed.body.sections;
  if (parsed.body.is_default !== undefined) updates.is_default = parsed.body.is_default;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const template = await updateDigestTemplate(supabase, templateId, updates);

  if (!template) return errorResponse('Digest template not found', 404);
  return successResponse(template);
}

/**
 * DELETE /api/whatsapp/digest-templates/[templateId]
 * Delete a digest template.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { templateId } = params;

  await deleteDigestTemplate(supabase, templateId);
  return successResponse({ deleted: true });
}
