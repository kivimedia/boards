import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * GET /api/boards/[id]/labels
 * List all labels for a board.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = params.id;

  const { data, error } = await supabase
    .from('labels')
    .select('*')
    .eq('board_id', boardId)
    .order('name', { ascending: true });

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse(data || []);
}
