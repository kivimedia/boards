import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { addToCollection } from '@/lib/asset-library';

interface Params {
  params: { collectionId: string };
}

interface AddToCollectionBody {
  assetId: string;
}

/**
 * POST /api/assets/collections/[collectionId]/items
 * Add an asset to a collection.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<AddToCollectionBody>(request);
  if (!parsed.ok) return parsed.response;

  const { assetId } = parsed.body;

  if (!assetId) return errorResponse('assetId is required');

  const { supabase } = auth.ctx;
  const item = await addToCollection(supabase, params.collectionId, assetId);

  if (!item) return errorResponse('Failed to add asset to collection', 500);
  return successResponse(item, 201);
}
