import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { unpinPage } from '@/lib/wiki';

interface Params {
  params: { pinId: string };
}

/**
 * DELETE /api/wiki/pins/[pinId]
 * Unpin a wiki page from a board.
 * pinId is expected as "boardId:pageId" format, or you can pass boardId and pageId
 * as query params for flexibility.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  let boardId = searchParams.get('boardId');
  let pageId = searchParams.get('pageId');

  // Support pinId as "boardId:pageId" composite key
  if (!boardId || !pageId) {
    const parts = params.pinId.split(':');
    if (parts.length === 2) {
      boardId = parts[0];
      pageId = parts[1];
    }
  }

  if (!boardId || !pageId) {
    return errorResponse('boardId and pageId are required (use query params or pinId as boardId:pageId)');
  }

  await unpinPage(supabase, boardId, pageId);
  return successResponse({ unpinned: true });
}
