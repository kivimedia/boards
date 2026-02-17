import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getCollectionAssets } from '@/lib/asset-library';

interface Params {
  params: { collectionId: string };
}

/**
 * GET /api/assets/collections/[collectionId]
 * Get assets in a collection.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const assets = await getCollectionAssets(supabase, params.collectionId);

  return successResponse(assets);
}

/**
 * DELETE /api/assets/collections/[collectionId]
 * Delete a collection.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Delete collection items first
  await supabase
    .from('asset_collection_items')
    .delete()
    .eq('collection_id', params.collectionId);

  // Delete the collection
  const { error } = await supabase
    .from('asset_collections')
    .delete()
    .eq('id', params.collectionId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
