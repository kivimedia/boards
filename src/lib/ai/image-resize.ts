import sharp from 'sharp';

// Claude API max dimension is 8000px. We use 7680 to leave a small margin.
const MAX_DIMENSION = 7680;

/**
 * Resize an image buffer if either dimension exceeds the Claude API limit (8000px).
 * Returns the original buffer unchanged if already within limits.
 */
export async function resizeForVision(
  buffer: Buffer,
  opts?: { maxDimension?: number }
): Promise<Buffer> {
  const maxDim = opts?.maxDimension ?? MAX_DIMENSION;

  try {
    const metadata = await sharp(buffer).metadata();
    const { width, height } = metadata;

    if (!width || !height) return buffer;
    if (width <= maxDim && height <= maxDim) return buffer;

    return await sharp(buffer)
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .toBuffer();
  } catch {
    return buffer;
  }
}
