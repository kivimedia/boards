import { SupabaseClient } from '@supabase/supabase-js';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface DiffResult {
  mismatchPercentage: number;
  diffImageBuffer: Buffer;
  width: number;
  height: number;
}

/**
 * Compare two images pixel-by-pixel and generate a diff image.
 * Both images must be PNG buffers.
 */
export function compareImages(
  img1Buffer: Buffer,
  img2Buffer: Buffer,
  threshold: number = 0.1
): DiffResult {
  const img1 = PNG.sync.read(img1Buffer);
  const img2 = PNG.sync.read(img2Buffer);

  // Use the larger dimensions
  const width = Math.max(img1.width, img2.width);
  const height = Math.max(img1.height, img2.height);

  // Create canvases of equal size
  const canvas1 = new PNG({ width, height });
  const canvas2 = new PNG({ width, height });
  const diffCanvas = new PNG({ width, height });

  // Copy image data into canvases (pad smaller images with transparent pixels)
  PNG.bitblt(img1, canvas1, 0, 0, img1.width, img1.height, 0, 0);
  PNG.bitblt(img2, canvas2, 0, 0, img2.width, img2.height, 0, 0);

  const numDiffPixels = pixelmatch(
    canvas1.data,
    canvas2.data,
    diffCanvas.data,
    width,
    height,
    { threshold }
  );

  const totalPixels = width * height;
  const mismatchPercentage = Math.round((numDiffPixels / totalPixels) * 10000) / 100;

  const diffImageBuffer = PNG.sync.write(diffCanvas);

  return { mismatchPercentage, diffImageBuffer, width, height };
}

/**
 * Download an image from Supabase storage as a Buffer.
 */
export async function downloadImage(
  supabase: SupabaseClient,
  storagePath: string
): Promise<Buffer | null> {
  const { data, error } = await supabase.storage
    .from('card-attachments')
    .download(storagePath);

  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Generate and store a visual diff between two design review attachments.
 */
export async function generateDesignDiff(
  supabase: SupabaseClient,
  currentStoragePath: string,
  previousStoragePath: string,
  cardId: string,
  reviewId: string
): Promise<{ diffStoragePath: string; mismatchPercentage: number } | null> {
  const [currentImg, previousImg] = await Promise.all([
    downloadImage(supabase, currentStoragePath),
    downloadImage(supabase, previousStoragePath),
  ]);

  if (!currentImg || !previousImg) return null;

  try {
    const diff = compareImages(previousImg, currentImg);

    // Upload diff image to storage
    const diffPath = `diffs/${cardId}/${reviewId}_diff.png`;
    const { error } = await supabase.storage
      .from('card-attachments')
      .upload(diffPath, diff.diffImageBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (error) {
      console.error('[VisualDiff] Upload failed:', error.message);
      return null;
    }

    return { diffStoragePath: diffPath, mismatchPercentage: diff.mismatchPercentage };
  } catch (err) {
    console.error('[VisualDiff] Comparison failed:', err);
    return null;
  }
}
