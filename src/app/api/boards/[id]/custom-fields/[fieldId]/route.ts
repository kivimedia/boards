import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { CustomFieldType } from '@/lib/types';

interface Params {
  params: { id: string; fieldId: string };
}

const VALID_FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'dropdown', 'date', 'checkbox', 'url'];

interface UpdateFieldDefinitionBody {
  name?: string;
  field_type?: CustomFieldType;
  options?: string[];
  is_required?: boolean;
  position?: number;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateFieldDefinitionBody>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { id: boardId, fieldId } = params;

  const updates: Record<string, unknown> = {};

  if (body.body.name !== undefined) {
    if (!body.body.name.trim()) return errorResponse('Field name cannot be empty');
    updates.name = body.body.name.trim();
  }
  if (body.body.field_type !== undefined) {
    if (!VALID_FIELD_TYPES.includes(body.body.field_type)) {
      return errorResponse(`field_type must be one of: ${VALID_FIELD_TYPES.join(', ')}`);
    }
    updates.field_type = body.body.field_type;
  }
  if (body.body.options !== undefined) {
    updates.options = body.body.options;
  }
  if (body.body.is_required !== undefined) {
    updates.is_required = body.body.is_required;
  }
  if (body.body.position !== undefined) {
    updates.position = body.body.position;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('custom_field_definitions')
    .update(updates)
    .eq('id', fieldId)
    .eq('board_id', boardId)
    .select('*')
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!data) return errorResponse('Field definition not found', 404);

  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: boardId, fieldId } = params;

  // Delete all values for this field definition first
  await supabase
    .from('custom_field_values')
    .delete()
    .eq('field_definition_id', fieldId);

  const { error } = await supabase
    .from('custom_field_definitions')
    .delete()
    .eq('id', fieldId)
    .eq('board_id', boardId);

  if (error) return errorResponse(error.message, 500);

  return successResponse({ deleted: true });
}
