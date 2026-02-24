import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { compareImages, downloadImage, generateDesignDiff } from '@/lib/ai/visual-diff';
import type { DiffResult } from '@/lib/ai/visual-diff';

/**
 * Create a solid-color PNG buffer for testing.
 */
function createTestPng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

/**
 * Create a PNG where the top half is one color and bottom half is another.
 */
function createHalfAndHalfPng(
  width: number,
  height: number,
  topRgb: [number, number, number],
  bottomRgb: [number, number, number]
): Buffer {
  const png = new PNG({ width, height });
  const midY = Math.floor(height / 2);
  for (let y = 0; y < height; y++) {
    const [r, g, b] = y < midY ? topRgb : bottomRgb;
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

describe('visual-diff', () => {
  // ===========================================================================
  // Exports verification
  // ===========================================================================

  describe('exports', () => {
    it('exports compareImages as a function', () => {
      expect(typeof compareImages).toBe('function');
    });

    it('exports downloadImage as a function', () => {
      expect(typeof downloadImage).toBe('function');
    });

    it('exports generateDesignDiff as a function', () => {
      expect(typeof generateDesignDiff).toBe('function');
    });
  });

  // ===========================================================================
  // compareImages — identical images
  // ===========================================================================

  describe('compareImages — identical images', () => {
    it('returns 0% mismatch for two identical solid-color images', () => {
      const red = createTestPng(10, 10, 255, 0, 0);
      const result = compareImages(red, red);
      expect(result.mismatchPercentage).toBe(0);
    });

    it('returns 0% mismatch for two identical larger images', () => {
      const blue = createTestPng(100, 100, 0, 0, 255);
      const result = compareImages(blue, blue);
      expect(result.mismatchPercentage).toBe(0);
    });
  });

  // ===========================================================================
  // compareImages — completely different images
  // ===========================================================================

  describe('compareImages — completely different images', () => {
    it('returns high mismatch for black vs white images', () => {
      const black = createTestPng(10, 10, 0, 0, 0);
      const white = createTestPng(10, 10, 255, 255, 255);
      const result = compareImages(black, white);
      expect(result.mismatchPercentage).toBeGreaterThan(90);
    });

    it('returns high mismatch for red vs blue images', () => {
      const red = createTestPng(20, 20, 255, 0, 0);
      const blue = createTestPng(20, 20, 0, 0, 255);
      const result = compareImages(red, blue);
      expect(result.mismatchPercentage).toBeGreaterThan(50);
    });
  });

  // ===========================================================================
  // compareImages — DiffResult shape
  // ===========================================================================

  describe('compareImages — DiffResult shape', () => {
    it('returns an object with all required DiffResult fields', () => {
      const img = createTestPng(8, 8, 128, 128, 128);
      const result: DiffResult = compareImages(img, img);
      expect(result).toHaveProperty('mismatchPercentage');
      expect(result).toHaveProperty('diffImageBuffer');
      expect(result).toHaveProperty('width');
      expect(result).toHaveProperty('height');
    });

    it('returns mismatchPercentage as a number', () => {
      const img = createTestPng(4, 4, 0, 0, 0);
      const result = compareImages(img, img);
      expect(typeof result.mismatchPercentage).toBe('number');
    });

    it('returns diffImageBuffer as a Buffer that can be decoded as a PNG', () => {
      const img1 = createTestPng(6, 6, 200, 100, 50);
      const img2 = createTestPng(6, 6, 50, 100, 200);
      const result = compareImages(img1, img2);
      expect(Buffer.isBuffer(result.diffImageBuffer)).toBe(true);
      // Should parse without throwing
      const diffPng = PNG.sync.read(result.diffImageBuffer);
      expect(diffPng.width).toBe(6);
      expect(diffPng.height).toBe(6);
    });

    it('returns correct width and height matching input dimensions', () => {
      const img = createTestPng(15, 25, 0, 255, 0);
      const result = compareImages(img, img);
      expect(result.width).toBe(15);
      expect(result.height).toBe(25);
    });
  });

  // ===========================================================================
  // compareImages — different dimensions
  // ===========================================================================

  describe('compareImages — different dimensions', () => {
    it('uses the max of both widths and heights', () => {
      const small = createTestPng(5, 5, 255, 0, 0);
      const large = createTestPng(10, 15, 255, 0, 0);
      const result = compareImages(small, large);
      expect(result.width).toBe(10);
      expect(result.height).toBe(15);
    });

    it('detects differences in the padded area when sizes differ', () => {
      const small = createTestPng(5, 5, 255, 0, 0);
      const large = createTestPng(10, 10, 255, 0, 0);
      const result = compareImages(small, large);
      // The padded area (transparent vs red) causes mismatches
      expect(result.mismatchPercentage).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // compareImages — threshold parameter
  // ===========================================================================

  describe('compareImages — threshold parameter', () => {
    it('a high threshold (1.0) makes everything match', () => {
      const red = createTestPng(10, 10, 255, 0, 0);
      const blue = createTestPng(10, 10, 0, 0, 255);
      const result = compareImages(red, blue, 1.0);
      expect(result.mismatchPercentage).toBe(0);
    });

    it('a zero threshold is maximally sensitive', () => {
      // Two slightly different shades of gray
      const gray1 = createTestPng(10, 10, 128, 128, 128);
      const gray2 = createTestPng(10, 10, 129, 129, 129);
      const strictResult = compareImages(gray1, gray2, 0);
      const lenientResult = compareImages(gray1, gray2, 0.5);
      expect(strictResult.mismatchPercentage).toBeGreaterThanOrEqual(
        lenientResult.mismatchPercentage
      );
    });

    it('default threshold (0.1) detects large color differences', () => {
      const black = createTestPng(10, 10, 0, 0, 0);
      const white = createTestPng(10, 10, 255, 255, 255);
      const result = compareImages(black, white);
      expect(result.mismatchPercentage).toBe(100);
    });
  });

  // ===========================================================================
  // compareImages — edge cases
  // ===========================================================================

  describe('compareImages — edge cases', () => {
    it('handles 1x1 pixel images', () => {
      const px1 = createTestPng(1, 1, 0, 0, 0);
      const px2 = createTestPng(1, 1, 255, 255, 255);
      const result = compareImages(px1, px2);
      expect(result.width).toBe(1);
      expect(result.height).toBe(1);
      expect(result.mismatchPercentage).toBe(100);
    });

    it('handles 1x1 identical pixel images with 0% mismatch', () => {
      const px = createTestPng(1, 1, 42, 42, 42);
      const result = compareImages(px, px);
      expect(result.mismatchPercentage).toBe(0);
    });

    it('produces partial mismatch for half-changed image', () => {
      const allRed = createTestPng(10, 10, 255, 0, 0);
      const halfAndHalf = createHalfAndHalfPng(10, 10, [255, 0, 0], [0, 0, 255]);
      const result = compareImages(allRed, halfAndHalf);
      // Bottom half is different, so roughly 50% mismatch
      expect(result.mismatchPercentage).toBeGreaterThan(30);
      expect(result.mismatchPercentage).toBeLessThan(70);
    });

    it('mismatchPercentage is rounded to two decimal places', () => {
      // The implementation does: Math.round(ratio * 10000) / 100
      // So the result always has at most 2 decimal places
      const img1 = createTestPng(3, 3, 0, 0, 0);
      const img2 = createTestPng(3, 3, 255, 255, 255);
      const result = compareImages(img1, img2);
      const decimals = result.mismatchPercentage.toString().split('.')[1];
      expect(!decimals || decimals.length <= 2).toBe(true);
    });
  });
});
