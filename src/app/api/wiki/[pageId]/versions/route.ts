import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getPageVersions } from '@/lib/wiki';

interface Params {
  params: { pageId: string };
}

/**
 * GET /api/wiki/[pageId]/versions
 * Get all versions for a wiki page.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  if (!params.pageId) return errorResponse('pageId is required');

  const versions = await getPageVersions(supabase, params.pageId);
  return successResponse(versions);
}
