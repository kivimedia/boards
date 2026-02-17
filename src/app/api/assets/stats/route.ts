import { NextRequest } from 'next/server';
import { getAuthContext, successResponse } from '@/lib/api-helpers';
import { getAssetStats } from '@/lib/asset-library';

/**
 * GET /api/assets/stats
 * Get asset count statistics. Optional ?clientId= query param.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId') || undefined;

  const stats = await getAssetStats(supabase, clientId);
  return successResponse(stats);
}
