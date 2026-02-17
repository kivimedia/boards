import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { indexWikiPage } from '@/lib/ai/brain-indexers';

interface Params {
  params: { clientId: string };
}

interface IndexWikiBody {
  pageId: string;
}

/**
 * POST /api/clients/[clientId]/brain/index-wiki
 * Index a published wiki page into the client brain.
 *
 * Body:
 *   pageId: string (required) - The wiki page ID to index
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<IndexWikiBody>(request);
  if (!body.ok) return body.response;

  const { pageId } = body.body;
  const { supabase } = auth.ctx;
  const { clientId } = params;

  if (!clientId) return errorResponse('clientId is required');
  if (!pageId) return errorResponse('pageId is required');

  // Permission check: verify user has access to this client
  const { data: clientCheck } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .single();

  if (!clientCheck) {
    return errorResponse('Client not found or access denied', 404);
  }

  try {
    const result = await indexWikiPage(supabase, pageId, clientId);
    if (!result.success) {
      return errorResponse(result.error || 'Failed to index wiki page');
    }
    return successResponse({ message: 'Wiki page indexed successfully' });
  } catch (err) {
    return errorResponse(
      `Failed to index wiki page: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
