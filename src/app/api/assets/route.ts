import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getAssets } from '@/lib/asset-library';
import type { AssetType } from '@/lib/types';

/**
 * GET /api/assets
 * List assets with optional filters: clientId, assetType, search, tags (comma-separated).
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const clientId = searchParams.get('clientId') || undefined;
  const assetType = (searchParams.get('assetType') as AssetType) || undefined;
  const search = searchParams.get('search') || undefined;
  const tagsParam = searchParams.get('tags');
  const tags = tagsParam ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

  const assets = await getAssets(supabase, { clientId, assetType, search, tags });
  return successResponse(assets);
}

interface CreateAssetBody {
  name: string;
  storage_path: string;
  asset_type: AssetType;
  mime_type?: string;
  file_size?: number;
  client_id?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * POST /api/assets
 * Create an asset manually.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateAssetBody>(request);
  if (!parsed.ok) return parsed.response;

  const { name, storage_path, asset_type, mime_type, file_size, client_id, tags, metadata } = parsed.body;

  if (!name?.trim()) return errorResponse('name is required');
  if (!storage_path?.trim()) return errorResponse('storage_path is required');
  if (!asset_type) return errorResponse('asset_type is required');

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('assets')
    .insert({
      name: name.trim(),
      storage_path: storage_path.trim(),
      asset_type,
      mime_type: mime_type || null,
      file_size: file_size || 0,
      client_id: client_id || null,
      tags: tags || [],
      metadata: metadata || {},
      created_by: userId,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
