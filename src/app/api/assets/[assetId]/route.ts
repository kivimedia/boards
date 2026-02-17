import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getAsset, updateAsset, archiveAsset } from '@/lib/asset-library';

interface Params {
  params: { assetId: string };
}

/**
 * GET /api/assets/[assetId]
 * Get a single asset by ID.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const asset = await getAsset(supabase, params.assetId);

  if (!asset) return errorResponse('Asset not found', 404);
  return successResponse(asset);
}

interface UpdateAssetBody {
  name?: string;
  tags?: string[];
  is_archived?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * PATCH /api/assets/[assetId]
 * Update asset metadata (name, tags, metadata, is_archived).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateAssetBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const updates: Record<string, unknown> = {};

  if (parsed.body.name !== undefined) {
    if (!parsed.body.name.trim()) return errorResponse('Asset name cannot be empty');
    updates.name = parsed.body.name.trim();
  }
  if (parsed.body.tags !== undefined) updates.tags = parsed.body.tags;
  if (parsed.body.is_archived !== undefined) updates.is_archived = parsed.body.is_archived;
  if (parsed.body.metadata !== undefined) updates.metadata = parsed.body.metadata;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const asset = await updateAsset(supabase, params.assetId, updates as {
    name?: string;
    tags?: string[];
    is_archived?: boolean;
    metadata?: Record<string, unknown>;
  });

  if (!asset) return errorResponse('Failed to update asset', 500);
  return successResponse(asset);
}

/**
 * DELETE /api/assets/[assetId]
 * Soft-delete (archive) an asset.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  await archiveAsset(supabase, params.assetId);

  return successResponse({ archived: true });
}
