import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getClientBrainStats } from '@/lib/ai/client-brain';

interface Params {
  params: { clientId: string };
}

/**
 * GET /api/clients/[clientId]/brain/stats
 * Get document count stats for a client brain.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { clientId } = params;

  try {
    const stats = await getClientBrainStats(supabase, clientId);
    return successResponse(stats);
  } catch (err) {
    return errorResponse(
      `Failed to fetch brain stats: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
