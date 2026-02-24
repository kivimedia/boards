import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { clientId: string; boardLinkId: string };
}

/**
 * DELETE /api/clients/[clientId]/boards/[boardLinkId]
 * Unlink a board from a client (soft-delete by setting is_active = false).
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const { error } = await supabase
      .from('client_boards')
      .update({ is_active: false })
      .eq('id', params.boardLinkId)
      .eq('client_id', params.clientId);

    if (error) {
      return errorResponse(error.message, 500);
    }

    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(
      `Failed to unlink board: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
