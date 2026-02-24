import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { QAChecklistItem } from '@/lib/types';

interface Params {
  params: { templateId: string };
}

/**
 * GET /api/qa-templates/[templateId]
 * Get a single QA checklist template by ID.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { templateId } = params;

  const { data, error } = await supabase
    .from('qa_checklist_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error || !data) {
    return errorResponse('QA template not found', 404);
  }

  return successResponse(data);
}

interface UpdateTemplateBody {
  name?: string;
  description?: string;
  items?: QAChecklistItem[];
  is_default?: boolean;
}

/**
 * PUT /api/qa-templates/[templateId]
 * Update a QA checklist template.
 *
 * Body (all fields optional):
 *   name?: string
 *   description?: string
 *   items?: QAChecklistItem[]
 *   is_default?: boolean
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateTemplateBody>(request);
  if (!body.ok) return body.response;

  const { name, description, items, is_default } = body.body;
  const { supabase } = auth.ctx;
  const { templateId } = params;

  // Verify template exists
  const { data: existing, error: fetchError } = await supabase
    .from('qa_checklist_templates')
    .select('id')
    .eq('id', templateId)
    .single();

  if (fetchError || !existing) {
    return errorResponse('QA template not found', 404);
  }

  // Build update payload with only provided fields
  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('name must be a non-empty string');
    }
    updates.name = name.trim();
  }
  if (description !== undefined) {
    updates.description = description?.trim() ?? null;
  }
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      return errorResponse('items must be a non-empty array of QAChecklistItem');
    }
    updates.items = items;
  }
  if (is_default !== undefined) {
    updates.is_default = is_default;

    // If setting this template as default, unset any other default first
    if (is_default === true) {
      await supabase
        .from('qa_checklist_templates')
        .update({ is_default: false })
        .neq('id', templateId)
        .eq('is_default', true);
    }
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No fields to update');
  }

  const { data, error } = await supabase
    .from('qa_checklist_templates')
    .update(updates)
    .eq('id', templateId)
    .select()
    .single();

  if (error) {
    return errorResponse(`Failed to update QA template: ${error.message}`, 500);
  }

  return successResponse(data);
}

/**
 * DELETE /api/qa-templates/[templateId]
 * Delete a QA checklist template.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { templateId } = params;

  // Verify template exists
  const { data: existing, error: fetchError } = await supabase
    .from('qa_checklist_templates')
    .select('id')
    .eq('id', templateId)
    .single();

  if (fetchError || !existing) {
    return errorResponse('QA template not found', 404);
  }

  const { error: deleteError } = await supabase
    .from('qa_checklist_templates')
    .delete()
    .eq('id', templateId);

  if (deleteError) {
    return errorResponse(`Failed to delete QA template: ${deleteError.message}`, 500);
  }

  return successResponse({ deleted: true });
}
