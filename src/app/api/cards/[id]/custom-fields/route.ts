import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;
  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get('boardId');

  // If boardId provided, return both definitions and values
  if (boardId) {
    const [defsResult, valsResult] = await Promise.all([
      supabase
        .from('custom_field_definitions')
        .select('*')
        .eq('board_id', boardId)
        .order('position', { ascending: true }),
      supabase
        .from('custom_field_values')
        .select('*, definition:custom_field_definitions(*)')
        .eq('card_id', cardId),
    ]);

    if (defsResult.error) return errorResponse(defsResult.error.message, 500);
    if (valsResult.error) return errorResponse(valsResult.error.message, 500);

    return successResponse({
      definitions: defsResult.data || [],
      values: valsResult.data || [],
    });
  }

  // Legacy: return just values
  const { data, error } = await supabase
    .from('custom_field_values')
    .select('*, definition:custom_field_definitions(*)')
    .eq('card_id', cardId);

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface UpsertFieldValueBody {
  field_definition_id: string;
  value: unknown;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpsertFieldValueBody>(request);
  if (!body.ok) return body.response;

  const { field_definition_id, value } = body.body;

  if (!field_definition_id) return errorResponse('field_definition_id is required');

  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  // Check if a value already exists for this card + field
  const { data: existing } = await supabase
    .from('custom_field_values')
    .select('id')
    .eq('card_id', cardId)
    .eq('field_definition_id', field_definition_id)
    .single();

  let data;
  let error;

  if (existing) {
    // Update existing value
    const result = await supabase
      .from('custom_field_values')
      .update({
        value,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*, definition:custom_field_definitions(*)')
      .single();

    data = result.data;
    error = result.error;
  } else {
    // Insert new value
    const result = await supabase
      .from('custom_field_values')
      .insert({
        card_id: cardId,
        field_definition_id,
        value,
      })
      .select('*, definition:custom_field_definitions(*)')
      .single();

    data = result.data;
    error = result.error;
  }

  if (error) return errorResponse(error.message, 500);

  // Log activity
  await supabase.from('activity_log').insert({
    card_id: cardId,
    user_id: userId,
    event_type: 'custom_field_updated',
    metadata: {
      field_definition_id,
      value,
    },
  });

  return successResponse(data);
}
