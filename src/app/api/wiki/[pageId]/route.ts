import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getWikiPage, updateWikiPage, deleteWikiPage } from '@/lib/wiki';

interface Params {
  params: { pageId: string };
}

/**
 * GET /api/wiki/[pageId]
 * Get a single wiki page by ID or slug.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const page = await getWikiPage(supabase, params.pageId);

  if (!page) return errorResponse('Wiki page not found', 404);
  return successResponse(page);
}

interface UpdateWikiPageBody {
  title?: string;
  content?: string;
  department?: string | null;
  is_published?: boolean;
  tags?: string[];
  review_cadence_days?: number | null;
  changeSummary?: string;
}

/**
 * PATCH /api/wiki/[pageId]
 * Update a wiki page.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateWikiPageBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase, userId } = auth.ctx;

  const page = await updateWikiPage(supabase, params.pageId, {
    ...parsed.body,
    editedBy: userId,
  });

  if (!page) return errorResponse('Failed to update wiki page', 500);
  return successResponse(page);
}

/**
 * DELETE /api/wiki/[pageId]
 * Delete a wiki page.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  await deleteWikiPage(supabase, params.pageId);

  return successResponse({ deleted: true });
}
