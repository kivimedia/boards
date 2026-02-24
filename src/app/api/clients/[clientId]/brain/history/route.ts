import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getClientQueryHistory } from '@/lib/ai/client-brain';

interface Params {
  params: { clientId: string };
}

/**
 * GET /api/clients/[clientId]/brain/history
 * Get the query history for a client brain.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { clientId } = params;

  try {
    const history = await getClientQueryHistory(supabase, clientId);
    return successResponse(history);
  } catch (err) {
    return errorResponse(
      `Failed to fetch query history: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
