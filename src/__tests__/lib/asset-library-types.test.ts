import { describe, it, expect } from 'vitest';
import type {
  AssetType,
  Asset,
  AssetCollection,
  AssetCollectionItem,
} from '../../lib/types';

describe('Asset Library Types (P2.7)', () => {
  // ===========================================================================
  // AssetType — covers all 7 values
  // ===========================================================================

  describe('AssetType', () => {
    it('covers all 7 asset type values', () => {
      const values: AssetType[] = [
        'image',
        'video',
        'document',
        'audio',
        'font',
        'archive',
        'other',
      ];

      expect(values).toHaveLength(7);
      expect(values).toContain('image');
      expect(values).toContain('video');
      expect(values).toContain('document');
      expect(values).toContain('audio');
      expect(values).toContain('font');
      expect(values).toContain('archive');
      expect(values).toContain('other');
    });

    it('each value is a valid string', () => {
      const values: AssetType[] = ['image', 'video', 'document', 'audio', 'font', 'archive', 'other'];
      for (const val of values) {
        expect(typeof val).toBe('string');
        expect(val.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // Asset — required fields
  // ===========================================================================

  describe('Asset', () => {
    it('has all required fields', () => {
      const asset: Asset = {
        id: 'asset-001',
        client_id: 'client-123',
        name: 'hero-banner.png',
        storage_path: 'assets/client-123/hero-banner.png',
        asset_type: 'image',
        mime_type: 'image/png',
        file_size: 2048000,
        tags: ['hero', 'banner', 'homepage'],
        version: 1,
        parent_asset_id: null,
        source_card_id: 'card-456',
        source_attachment_id: 'att-789',
        metadata: { width: 1920, height: 1080 },
        is_archived: false,
        created_by: 'user-abc',
        created_at: '2025-06-15T10:00:00Z',
        updated_at: '2025-06-15T10:00:00Z',
      };

      expect(asset.id).toBe('asset-001');
      expect(asset.client_id).toBe('client-123');
      expect(asset.name).toBe('hero-banner.png');
      expect(asset.storage_path).toBe('assets/client-123/hero-banner.png');
      expect(asset.asset_type).toBe('image');
      expect(asset.mime_type).toBe('image/png');
      expect(asset.file_size).toBe(2048000);
      expect(asset.tags).toEqual(['hero', 'banner', 'homepage']);
      expect(asset.version).toBe(1);
      expect(asset.parent_asset_id).toBeNull();
      expect(asset.source_card_id).toBe('card-456');
      expect(asset.source_attachment_id).toBe('att-789');
      expect(asset.metadata).toEqual({ width: 1920, height: 1080 });
      expect(asset.is_archived).toBe(false);
      expect(asset.created_by).toBe('user-abc');
      expect(asset.created_at).toBe('2025-06-15T10:00:00Z');
      expect(asset.updated_at).toBe('2025-06-15T10:00:00Z');
    });

    it('allows null client_id for unassigned assets', () => {
      const asset: Asset = {
        id: 'asset-002',
        client_id: null,
        name: 'company-logo.svg',
        storage_path: 'assets/shared/company-logo.svg',
        asset_type: 'image',
        mime_type: 'image/svg+xml',
        file_size: 4500,
        tags: ['logo'],
        version: 1,
        parent_asset_id: null,
        source_card_id: null,
        source_attachment_id: null,
        metadata: {},
        is_archived: false,
        created_by: null,
        created_at: '2025-07-01T08:00:00Z',
        updated_at: '2025-07-01T08:00:00Z',
      };

      expect(asset.client_id).toBeNull();
      expect(asset.source_card_id).toBeNull();
      expect(asset.source_attachment_id).toBeNull();
      expect(asset.created_by).toBeNull();
    });

    it('supports versioned assets with parent_asset_id', () => {
      const asset: Asset = {
        id: 'asset-003',
        client_id: 'client-123',
        name: 'hero-banner-v2.png',
        storage_path: 'assets/client-123/hero-banner-v2.png',
        asset_type: 'image',
        mime_type: 'image/png',
        file_size: 2200000,
        tags: ['hero', 'banner'],
        version: 2,
        parent_asset_id: 'asset-001',
        source_card_id: null,
        source_attachment_id: null,
        metadata: { width: 1920, height: 1080 },
        is_archived: false,
        created_by: 'user-abc',
        created_at: '2025-06-20T14:00:00Z',
        updated_at: '2025-06-20T14:00:00Z',
      };

      expect(asset.version).toBe(2);
      expect(asset.parent_asset_id).toBe('asset-001');
    });

    it('supports empty tags array', () => {
      const asset: Asset = {
        id: 'asset-004',
        client_id: null,
        name: 'document.pdf',
        storage_path: 'assets/document.pdf',
        asset_type: 'document',
        mime_type: 'application/pdf',
        file_size: 500000,
        tags: [],
        version: 1,
        parent_asset_id: null,
        source_card_id: null,
        source_attachment_id: null,
        metadata: {},
        is_archived: false,
        created_by: null,
        created_at: '2025-08-01T00:00:00Z',
        updated_at: '2025-08-01T00:00:00Z',
      };

      expect(asset.tags).toEqual([]);
      expect(asset.tags).toHaveLength(0);
    });
  });

  // ===========================================================================
  // AssetCollection — required fields
  // ===========================================================================

  describe('AssetCollection', () => {
    it('has all required fields', () => {
      const collection: AssetCollection = {
        id: 'col-001',
        name: 'Brand Assets',
        description: 'All brand-related design assets',
        client_id: 'client-123',
        parent_collection_id: null,
        cover_asset_id: 'asset-001',
        created_by: 'user-abc',
        created_at: '2025-06-01T12:00:00Z',
        updated_at: '2025-06-01T12:00:00Z',
      };

      expect(collection.id).toBe('col-001');
      expect(collection.name).toBe('Brand Assets');
      expect(collection.description).toBe('All brand-related design assets');
      expect(collection.client_id).toBe('client-123');
      expect(collection.parent_collection_id).toBeNull();
      expect(collection.cover_asset_id).toBe('asset-001');
      expect(collection.created_by).toBe('user-abc');
      expect(collection.created_at).toBe('2025-06-01T12:00:00Z');
      expect(collection.updated_at).toBe('2025-06-01T12:00:00Z');
    });

    it('allows null optional fields', () => {
      const collection: AssetCollection = {
        id: 'col-002',
        name: 'General Assets',
        description: null,
        client_id: null,
        parent_collection_id: null,
        cover_asset_id: null,
        created_by: null,
        created_at: '2025-07-01T00:00:00Z',
        updated_at: '2025-07-01T00:00:00Z',
      };

      expect(collection.description).toBeNull();
      expect(collection.client_id).toBeNull();
      expect(collection.parent_collection_id).toBeNull();
      expect(collection.cover_asset_id).toBeNull();
      expect(collection.created_by).toBeNull();
    });

    it('supports nested collections with parent_collection_id', () => {
      const collection: AssetCollection = {
        id: 'col-003',
        name: 'Logo Variations',
        description: 'All logo color variations and sizes',
        client_id: 'client-123',
        parent_collection_id: 'col-001',
        cover_asset_id: null,
        created_by: 'user-abc',
        created_at: '2025-06-15T09:00:00Z',
        updated_at: '2025-06-15T09:00:00Z',
      };

      expect(collection.parent_collection_id).toBe('col-001');
    });
  });

  // ===========================================================================
  // AssetCollectionItem — required fields
  // ===========================================================================

  describe('AssetCollectionItem', () => {
    it('has all required fields', () => {
      const item: AssetCollectionItem = {
        id: 'item-001',
        collection_id: 'col-001',
        asset_id: 'asset-001',
        position: 0,
        added_at: '2025-06-15T10:30:00Z',
      };

      expect(item.id).toBe('item-001');
      expect(item.collection_id).toBe('col-001');
      expect(item.asset_id).toBe('asset-001');
      expect(item.position).toBe(0);
      expect(item.added_at).toBe('2025-06-15T10:30:00Z');
    });

    it('position is a non-negative number', () => {
      const item: AssetCollectionItem = {
        id: 'item-002',
        collection_id: 'col-001',
        asset_id: 'asset-002',
        position: 5,
        added_at: '2025-06-16T11:00:00Z',
      };

      expect(item.position).toBeGreaterThanOrEqual(0);
      expect(typeof item.position).toBe('number');
    });

    it('references valid collection and asset IDs', () => {
      const item: AssetCollectionItem = {
        id: 'item-003',
        collection_id: 'col-002',
        asset_id: 'asset-003',
        position: 0,
        added_at: '2025-07-01T12:00:00Z',
      };

      expect(item.collection_id).toBe('col-002');
      expect(item.asset_id).toBe('asset-003');
      expect(typeof item.collection_id).toBe('string');
      expect(typeof item.asset_id).toBe('string');
    });
  });
});
