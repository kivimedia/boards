import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string; depId: string };
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id: cardId, depId } = params;

  // Fetch the dependency before deleting for activity log metadata
  const { data: dependency, error: fetchError } = await supabase
    .from('card_dependencies')
    .select('*')
    .eq('id', depId)
    .single();

  if (fetchError || !dependency) return errorResponse('Dependency not found', 404);

  // Verify this dependency is associated with this card (as source or target)
  if (dependency.source_card_id !== cardId && dependency.target_card_id !== cardId) {
    return errorResponse('Dependency not found for this card', 404);
  }

  const { error } = await supabase
    .from('card_dependencies')
    .delete()
    .eq('id', depId);

  if (error) return errorResponse(error.message, 500);

  // Log activity
  await supabase.from('activity_log').insert({
    card_id: cardId,
    user_id: userId,
    event_type: 'dependency_removed',
    metadata: {
      dependency_id: depId,
      target_card_id: dependency.target_card_id,
      source_card_id: dependency.source_card_id,
      dependency_type: dependency.dependency_type,
    },
  });

  return successResponse({ deleted: true });
}
