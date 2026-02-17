import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { CustomFieldType } from '@/lib/types';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  const { data, error } = await supabase
    .from('custom_field_definitions')
    .select('*')
    .eq('board_id', boardId)
    .order('position', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

const VALID_FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'dropdown', 'date', 'checkbox', 'url'];

interface CreateFieldDefinitionBody {
  name: string;
  field_type: CustomFieldType;
  options?: string[];
  is_required?: boolean;
  position?: number;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateFieldDefinitionBody>(request);
  if (!body.ok) return body.response;

  const { name, field_type, options, is_required } = body.body;

  if (!name?.trim()) return errorResponse('Field name is required');
  if (!field_type || !VALID_FIELD_TYPES.includes(field_type)) {
    return errorResponse(`field_type must be one of: ${VALID_FIELD_TYPES.join(', ')}`);
  }

  const { supabase } = auth.ctx;
  const boardId = params.id;

  // Determine position if not provided
  let position = body.body.position;
  if (position === undefined) {
    const { data: existing } = await supabase
      .from('custom_field_definitions')
      .select('position')
      .eq('board_id', boardId)
      .order('position', { ascending: false })
      .limit(1);

    position = existing && existing.length > 0 ? (existing[0].position as number) + 1 : 0;
  }

  const { data, error } = await supabase
    .from('custom_field_definitions')
    .insert({
      board_id: boardId,
      name: name.trim(),
      field_type,
      options: options || [],
      is_required: is_required ?? false,
      position,
    })
    .select('*')
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
