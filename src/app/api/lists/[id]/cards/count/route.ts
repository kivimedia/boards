import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * GET /api/lists/[id]/cards/count
 * Returns the number of cards in a list (for position selector).
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { count, error } = await supabase
    .from('card_placements')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', params.id);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ count: count ?? 0 });
}
