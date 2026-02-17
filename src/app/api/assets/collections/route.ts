import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getCollections, createCollection } from '@/lib/asset-library';

/**
 * GET /api/assets/collections
 * List asset collections. Optional ?clientId= query param.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId') || undefined;

  const collections = await getCollections(supabase, clientId);
  return successResponse(collections);
}

interface CreateCollectionBody {
  name: string;
  clientId?: string;
  description?: string;
}

/**
 * POST /api/assets/collections
 * Create a new asset collection.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateCollectionBody>(request);
  if (!parsed.ok) return parsed.response;

  const { name, clientId, description } = parsed.body;

  if (!name?.trim()) return errorResponse('Collection name is required');

  const { supabase, userId } = auth.ctx;
  const collection = await createCollection(supabase, name.trim(), userId, clientId, description?.trim());

  if (!collection) return errorResponse('Failed to create collection', 500);
  return successResponse(collection, 201);
}
