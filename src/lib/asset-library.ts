import { SupabaseClient } from '@supabase/supabase-js';
import type { Asset, AssetType, AssetCollection, AssetCollectionItem } from './types';

// ============================================================================
// MIME TYPE → ASSET TYPE MAPPING
// ============================================================================

export function mimeToAssetType(mimeType: string): AssetType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('font') || mimeType.includes('woff') || mimeType.includes('ttf') || mimeType.includes('otf')) return 'font';
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar') || mimeType.includes('7z')) return 'archive';
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('presentation') ||
    mimeType.includes('text/')
  ) return 'document';
  return 'other';
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  image: 'Images',
  video: 'Videos',
  document: 'Documents',
  audio: 'Audio',
  font: 'Fonts',
  archive: 'Archives',
  other: 'Other',
};

export const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  image: '🖼️',
  video: '🎬',
  document: '📄',
  audio: '🎵',
  font: '🔤',
  archive: '📦',
  other: '📎',
};

// ============================================================================
// AUTO-ARCHIVE FROM APPROVED/DELIVERED CARDS
// ============================================================================

/**
 * Auto-archive attachments from a card into the asset library.
 * Called when a card moves to Approved or Delivered status.
 */
export async function autoArchiveCardAssets(
  supabase: SupabaseClient,
  cardId: string,
  clientId: string | null,
  userId: string
): Promise<Asset[]> {
  // Fetch card attachments
  const { data: attachments } = await supabase
    .from('attachments')
    .select('id, file_name, file_size, mime_type, storage_path')
    .eq('card_id', cardId);

  if (!attachments || attachments.length === 0) return [];

  const assets: Asset[] = [];

  for (const att of attachments) {
    // Check if already archived
    const { data: existing } = await supabase
      .from('assets')
      .select('id')
      .eq('source_attachment_id', att.id)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const assetType = mimeToAssetType(att.mime_type || 'application/octet-stream');

    const { data: asset, error } = await supabase
      .from('assets')
      .insert({
        client_id: clientId,
        name: att.file_name,
        storage_path: att.storage_path,
        asset_type: assetType,
        mime_type: att.mime_type,
        file_size: att.file_size || 0,
        source_card_id: cardId,
        source_attachment_id: att.id,
        created_by: userId,
      })
      .select()
      .single();

    if (!error && asset) {
      assets.push(asset as Asset);
    }
  }

  return assets;
}

// ============================================================================
// ASSET CRUD
// ============================================================================

/**
 * Get assets with optional filters.
 */
export async function getAssets(
  supabase: SupabaseClient,
  filters?: {
    clientId?: string;
    assetType?: AssetType;
    tags?: string[];
    search?: string;
    includeArchived?: boolean;
  }
): Promise<Asset[]> {
  let query = supabase
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false });

  if (!filters?.includeArchived) {
    query = query.eq('is_archived', false);
  }
  if (filters?.clientId) query = query.eq('client_id', filters.clientId);
  if (filters?.assetType) query = query.eq('asset_type', filters.assetType);
  if (filters?.tags && filters.tags.length > 0) {
    query = query.overlaps('tags', filters.tags);
  }
  if (filters?.search) {
    query = query.ilike('name', `%${filters.search}%`);
  }

  const { data } = await query.limit(100);
  return (data as Asset[]) ?? [];
}

/**
 * Get a single asset by ID.
 */
export async function getAsset(
  supabase: SupabaseClient,
  assetId: string
): Promise<Asset | null> {
  const { data } = await supabase
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .single();

  return data as Asset | null;
}

/**
 * Get version history for an asset.
 */
export async function getAssetVersions(
  supabase: SupabaseClient,
  assetId: string
): Promise<Asset[]> {
  const asset = await getAsset(supabase, assetId);
  if (!asset) return [];

  // Find root asset
  let rootId = assetId;
  if (asset.parent_asset_id) {
    rootId = asset.parent_asset_id;
  }

  const { data } = await supabase
    .from('assets')
    .select('*')
    .or(`id.eq.${rootId},parent_asset_id.eq.${rootId}`)
    .order('version', { ascending: true });

  return (data as Asset[]) ?? [];
}

/**
 * Update asset metadata (tags, name, etc.).
 */
export async function updateAsset(
  supabase: SupabaseClient,
  assetId: string,
  updates: { name?: string; tags?: string[]; is_archived?: boolean; metadata?: Record<string, unknown> }
): Promise<Asset | null> {
  const { data, error } = await supabase
    .from('assets')
    .update(updates)
    .eq('id', assetId)
    .select()
    .single();

  if (error) return null;
  return data as Asset;
}

/**
 * Delete an asset (soft delete via archive).
 */
export async function archiveAsset(
  supabase: SupabaseClient,
  assetId: string
): Promise<void> {
  await supabase
    .from('assets')
    .update({ is_archived: true })
    .eq('id', assetId);
}

// ============================================================================
// COLLECTIONS
// ============================================================================

/**
 * Get collections.
 */
export async function getCollections(
  supabase: SupabaseClient,
  clientId?: string
): Promise<AssetCollection[]> {
  let query = supabase
    .from('asset_collections')
    .select('*')
    .order('created_at', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);

  const { data } = await query;
  return (data as AssetCollection[]) ?? [];
}

/**
 * Create a collection.
 */
export async function createCollection(
  supabase: SupabaseClient,
  name: string,
  userId: string,
  clientId?: string,
  description?: string
): Promise<AssetCollection | null> {
  const { data, error } = await supabase
    .from('asset_collections')
    .insert({
      name,
      description: description ?? null,
      client_id: clientId ?? null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) return null;
  return data as AssetCollection;
}

/**
 * Add an asset to a collection.
 */
export async function addToCollection(
  supabase: SupabaseClient,
  collectionId: string,
  assetId: string
): Promise<AssetCollectionItem | null> {
  // Get next position
  const { data: existing } = await supabase
    .from('asset_collection_items')
    .select('position')
    .eq('collection_id', collectionId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await supabase
    .from('asset_collection_items')
    .insert({
      collection_id: collectionId,
      asset_id: assetId,
      position: nextPosition,
    })
    .select()
    .single();

  if (error) return null;
  return data as AssetCollectionItem;
}

/**
 * Get assets in a collection.
 */
export async function getCollectionAssets(
  supabase: SupabaseClient,
  collectionId: string
): Promise<Asset[]> {
  const { data } = await supabase
    .from('asset_collection_items')
    .select('asset_id, assets(*)')
    .eq('collection_id', collectionId)
    .order('position', { ascending: true });

  if (!data) return [];
  return data.map((item: unknown) => {
    const row = item as { assets: Asset | Asset[] };
    return Array.isArray(row.assets) ? row.assets[0] : row.assets;
  }).filter(Boolean);
}

/**
 * Get asset count statistics.
 */
export async function getAssetStats(
  supabase: SupabaseClient,
  clientId?: string
): Promise<{ total: number; byType: Record<string, number>; totalSize: number }> {
  let query = supabase
    .from('assets')
    .select('asset_type, file_size')
    .eq('is_archived', false);

  if (clientId) query = query.eq('client_id', clientId);

  const { data } = await query;
  if (!data) return { total: 0, byType: {}, totalSize: 0 };

  const byType: Record<string, number> = {};
  let totalSize = 0;
  for (const asset of data) {
    byType[asset.asset_type] = (byType[asset.asset_type] || 0) + 1;
    totalSize += asset.file_size || 0;
  }

  return { total: data.length, byType, totalSize };
}
