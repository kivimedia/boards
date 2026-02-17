import { describe, it, expect } from 'vitest';
import { mimeToAssetType, ASSET_TYPE_LABELS, ASSET_TYPE_ICONS } from '../../lib/asset-library';
import type { AssetType } from '../../lib/types';

describe('Asset Library (P2.7)', () => {
  // ===========================================================================
  // mimeToAssetType — image types
  // ===========================================================================

  describe('mimeToAssetType — image types', () => {
    it('maps image/png to image', () => {
      expect(mimeToAssetType('image/png')).toBe('image');
    });

    it('maps image/jpeg to image', () => {
      expect(mimeToAssetType('image/jpeg')).toBe('image');
    });

    it('maps image/svg+xml to image', () => {
      expect(mimeToAssetType('image/svg+xml')).toBe('image');
    });

    it('maps image/gif to image', () => {
      expect(mimeToAssetType('image/gif')).toBe('image');
    });

    it('maps image/webp to image', () => {
      expect(mimeToAssetType('image/webp')).toBe('image');
    });
  });

  // ===========================================================================
  // mimeToAssetType — video types
  // ===========================================================================

  describe('mimeToAssetType — video types', () => {
    it('maps video/mp4 to video', () => {
      expect(mimeToAssetType('video/mp4')).toBe('video');
    });

    it('maps video/webm to video', () => {
      expect(mimeToAssetType('video/webm')).toBe('video');
    });

    it('maps video/quicktime to video', () => {
      expect(mimeToAssetType('video/quicktime')).toBe('video');
    });
  });

  // ===========================================================================
  // mimeToAssetType — audio types
  // ===========================================================================

  describe('mimeToAssetType — audio types', () => {
    it('maps audio/mpeg to audio', () => {
      expect(mimeToAssetType('audio/mpeg')).toBe('audio');
    });

    it('maps audio/wav to audio', () => {
      expect(mimeToAssetType('audio/wav')).toBe('audio');
    });

    it('maps audio/ogg to audio', () => {
      expect(mimeToAssetType('audio/ogg')).toBe('audio');
    });
  });

  // ===========================================================================
  // mimeToAssetType — document types
  // ===========================================================================

  describe('mimeToAssetType — document types', () => {
    it('maps application/pdf to document', () => {
      expect(mimeToAssetType('application/pdf')).toBe('document');
    });

    it('maps application/vnd.openxmlformats-officedocument.wordprocessingml.document to document', () => {
      expect(mimeToAssetType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document');
    });

    it('maps application/vnd.openxmlformats-officedocument.spreadsheetml.sheet to document', () => {
      expect(mimeToAssetType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('document');
    });

    it('maps application/vnd.openxmlformats-officedocument.presentationml.presentation to document', () => {
      expect(mimeToAssetType('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('document');
    });

    it('maps text/plain to document', () => {
      expect(mimeToAssetType('text/plain')).toBe('document');
    });

    it('maps text/csv to document', () => {
      expect(mimeToAssetType('text/csv')).toBe('document');
    });
  });

  // ===========================================================================
  // mimeToAssetType — font types
  // ===========================================================================

  describe('mimeToAssetType — font types', () => {
    it('maps font/woff2 to font', () => {
      expect(mimeToAssetType('font/woff2')).toBe('font');
    });

    it('maps font/woff to font', () => {
      expect(mimeToAssetType('font/woff')).toBe('font');
    });

    it('maps font/ttf to font', () => {
      expect(mimeToAssetType('font/ttf')).toBe('font');
    });

    it('maps font/otf to font', () => {
      expect(mimeToAssetType('font/otf')).toBe('font');
    });

    it('maps application/font-woff to font', () => {
      expect(mimeToAssetType('application/font-woff')).toBe('font');
    });
  });

  // ===========================================================================
  // mimeToAssetType — archive types
  // ===========================================================================

  describe('mimeToAssetType — archive types', () => {
    it('maps application/zip to archive', () => {
      expect(mimeToAssetType('application/zip')).toBe('archive');
    });

    it('maps application/x-tar to archive', () => {
      expect(mimeToAssetType('application/x-tar')).toBe('archive');
    });

    it('maps application/x-rar-compressed to archive', () => {
      expect(mimeToAssetType('application/x-rar-compressed')).toBe('archive');
    });

    it('maps application/x-7z-compressed to archive', () => {
      expect(mimeToAssetType('application/x-7z-compressed')).toBe('archive');
    });
  });

  // ===========================================================================
  // mimeToAssetType — unknown / other types
  // ===========================================================================

  describe('mimeToAssetType — unknown types', () => {
    it('returns other for application/octet-stream', () => {
      expect(mimeToAssetType('application/octet-stream')).toBe('other');
    });

    it('returns other for empty string', () => {
      expect(mimeToAssetType('')).toBe('other');
    });

    it('returns other for application/json', () => {
      expect(mimeToAssetType('application/json')).toBe('other');
    });

    it('returns other for unknown mime types', () => {
      expect(mimeToAssetType('application/x-custom-type')).toBe('other');
    });
  });

  // ===========================================================================
  // ASSET_TYPE_LABELS — covers all 7 types
  // ===========================================================================

  describe('ASSET_TYPE_LABELS', () => {
    it('covers all 7 asset types', () => {
      const allTypes: AssetType[] = ['image', 'video', 'document', 'audio', 'font', 'archive', 'other'];
      expect(Object.keys(ASSET_TYPE_LABELS)).toHaveLength(7);

      for (const type of allTypes) {
        expect(ASSET_TYPE_LABELS[type]).toBeDefined();
        expect(typeof ASSET_TYPE_LABELS[type]).toBe('string');
        expect(ASSET_TYPE_LABELS[type].length).toBeGreaterThan(0);
      }
    });

    it('returns correct label for image', () => {
      expect(ASSET_TYPE_LABELS.image).toBe('Images');
    });

    it('returns correct label for video', () => {
      expect(ASSET_TYPE_LABELS.video).toBe('Videos');
    });

    it('returns correct label for document', () => {
      expect(ASSET_TYPE_LABELS.document).toBe('Documents');
    });

    it('returns correct label for audio', () => {
      expect(ASSET_TYPE_LABELS.audio).toBe('Audio');
    });

    it('returns correct label for font', () => {
      expect(ASSET_TYPE_LABELS.font).toBe('Fonts');
    });

    it('returns correct label for archive', () => {
      expect(ASSET_TYPE_LABELS.archive).toBe('Archives');
    });

    it('returns correct label for other', () => {
      expect(ASSET_TYPE_LABELS.other).toBe('Other');
    });
  });

  // ===========================================================================
  // ASSET_TYPE_ICONS — covers all 7 types
  // ===========================================================================

  describe('ASSET_TYPE_ICONS', () => {
    it('covers all 7 asset types', () => {
      const allTypes: AssetType[] = ['image', 'video', 'document', 'audio', 'font', 'archive', 'other'];
      expect(Object.keys(ASSET_TYPE_ICONS)).toHaveLength(7);

      for (const type of allTypes) {
        expect(ASSET_TYPE_ICONS[type]).toBeDefined();
        expect(typeof ASSET_TYPE_ICONS[type]).toBe('string');
        expect(ASSET_TYPE_ICONS[type].length).toBeGreaterThan(0);
      }
    });

    it('each icon is a non-empty string', () => {
      for (const icon of Object.values(ASSET_TYPE_ICONS)) {
        expect(typeof icon).toBe('string');
        expect(icon.length).toBeGreaterThan(0);
      }
    });
  });
});
