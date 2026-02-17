import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getAssetVersions } from '@/lib/asset-library';

interface Params {
  params: { assetId: string };
}

/**
 * GET /api/assets/[assetId]/versions
 * Get version history for an asset.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const versions = await getAssetVersions(supabase, params.assetId);

  return successResponse(versions);
}
