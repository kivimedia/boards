import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

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
