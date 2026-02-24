import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { indexMapBoard } from '@/lib/ai/brain-indexers';

interface Params {
  params: { clientId: string };
}

/**
 * POST /api/clients/[clientId]/brain/index-map
 * Index a client's Map Board data (doors, keys, training, sections) into the brain.
 */
export async function POST(_request: Request, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { clientId } = params;

  if (!clientId) return errorResponse('clientId is required');

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
    const result = await indexMapBoard(supabase, clientId);
    return successResponse({
      message: `Map board indexed: ${result.indexed} documents, ${result.errors} errors`,
      ...result,
    });
  } catch (err) {
    return errorResponse(
      `Failed to index map board: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
