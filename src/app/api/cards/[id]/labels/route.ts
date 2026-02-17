import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface ToggleLabelBody {
  label_id: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<ToggleLabelBody>(request);
  if (!body.ok) return body.response;

  if (!body.body.label_id) return errorResponse('label_id is required');

  const { supabase } = auth.ctx;
  const cardId = params.id;
  const { label_id } = body.body;

  // Check if label is already attached
  const { data: existing } = await supabase
    .from('card_labels')
    .select('*')
    .eq('card_id', cardId)
    .eq('label_id', label_id)
    .single();

  if (existing) {
    // Remove it
    await supabase
      .from('card_labels')
      .delete()
      .eq('card_id', cardId)
      .eq('label_id', label_id);
    return successResponse({ action: 'removed' });
  } else {
    // Add it
    const { error } = await supabase
      .from('card_labels')
      .insert({ card_id: cardId, label_id });
    if (error) return errorResponse(error.message, 500);
    return successResponse({ action: 'added' }, 201);
  }
}
