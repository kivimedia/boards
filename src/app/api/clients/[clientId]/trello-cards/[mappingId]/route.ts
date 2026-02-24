import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { unlinkTrelloCard } from '@/lib/trello-browse';

interface Params {
  params: Promise<{ clientId: string; mappingId: string }>;
}

/**
 * DELETE /api/clients/[clientId]/trello-cards/[mappingId]
 * Remove a Trello card tracking link from this client.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { mappingId } = await params;

  try {
    await unlinkTrelloCard(auth.ctx.supabase, mappingId);
    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to unlink card', 500);
  }
}
