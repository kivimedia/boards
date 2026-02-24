import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string; qaId: string };
}

/**
 * GET /api/cards/[id]/qa/[qaId]
 * Get a single QA result by ID.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: cardId, qaId } = params;

  const { data, error } = await supabase
    .from('ai_qa_results')
    .select('*')
    .eq('id', qaId)
    .eq('card_id', cardId)
    .single();

  if (error || !data) {
    return errorResponse('QA result not found', 404);
  }

  return successResponse(data);
}

/**
 * DELETE /api/cards/[id]/qa/[qaId]
 * Delete a QA result.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: cardId, qaId } = params;

  // Verify the QA result exists and belongs to this card
  const { data: existing, error: fetchError } = await supabase
    .from('ai_qa_results')
    .select('id')
    .eq('id', qaId)
    .eq('card_id', cardId)
    .single();

  if (fetchError || !existing) {
    return errorResponse('QA result not found', 404);
  }

  const { error: deleteError } = await supabase
    .from('ai_qa_results')
    .delete()
    .eq('id', qaId)
    .eq('card_id', cardId);

  if (deleteError) {
    return errorResponse(`Failed to delete QA result: ${deleteError.message}`, 500);
  }

  return successResponse({ deleted: true });
}
