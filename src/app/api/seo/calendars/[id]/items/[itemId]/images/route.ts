import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import sharp from 'sharp';

type Params = { params: Promise<{ id: string; itemId: string }> };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Optimization settings
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 82; // Good balance: sharp, not bloated

/**
 * Optimize an image for web: resize to max width, convert to WebP.
 * Returns { buffer, width, height, originalSize, optimizedSize }.
 */
async function optimizeImage(fileBuffer: Buffer, mimeType: string) {
  const originalSize = fileBuffer.length;

  // GIFs may be animated - skip optimization to preserve animation
  if (mimeType === 'image/gif') {
    return { buffer: fileBuffer, mime: 'image/gif' as const, originalSize, optimizedSize: originalSize, skipped: true };
  }

  const image = sharp(fileBuffer);
  const metadata = await image.metadata();
  const needsResize = metadata.width && metadata.width > MAX_WIDTH;

  let pipeline = image;
  if (needsResize) {
    pipeline = pipeline.resize(MAX_WIDTH, undefined, { withoutEnlargement: true });
  }

  const optimized = await pipeline
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer();

  return {
    buffer: optimized,
    mime: 'image/webp' as const,
    originalSize,
    optimizedSize: optimized.length,
    skipped: false,
  };
}

/**
 * POST /api/seo/calendars/[id]/items/[itemId]/images
 * Upload an image to a calendar item.
 * Automatically optimizes: resizes to max 1600px wide, converts to WebP.
 * Accepts multipart/form-data with `file` and optional `context` fields.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id, itemId } = await params;

  // Verify item exists and is editable
  const { data: item } = await supabase
    .from('seo_calendar_items')
    .select('id, status, images, calendar_id')
    .eq('id', itemId)
    .eq('calendar_id', id)
    .single();

  if (!item) return errorResponse('Item not found', 404);
  if (item.status === 'launched') return errorResponse('Cannot modify a launched item', 400);

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const context = (formData.get('context') as string) || null;

  if (!file) return errorResponse('No file provided');
  if (file.size > MAX_FILE_SIZE) return errorResponse('File too large. Maximum 10MB.');
  if (!ALLOWED_TYPES.includes(file.type)) return errorResponse('Invalid file type. Allowed: JPEG, PNG, GIF, WebP');

  // Optimize the image
  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const optimized = await optimizeImage(rawBuffer, file.type);

  // Build filename: keep original name but swap extension to .webp (unless GIF)
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const ext = optimized.mime === 'image/webp' ? '.webp' : '.gif';
  const optimizedFilename = `${baseName}${ext}`;
  const storagePath = `${itemId}/${Date.now()}_${optimizedFilename}`;

  // Upload optimized image to public bucket
  const { error: uploadErr } = await supabase.storage
    .from('seo-calendar-images')
    .upload(storagePath, optimized.buffer, {
      contentType: optimized.mime,
    });

  if (uploadErr) return errorResponse(`Upload failed: ${uploadErr.message}`, 500);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('seo-calendar-images')
    .getPublicUrl(storagePath);

  const newImage = {
    storage_path: storagePath,
    url: urlData.publicUrl,
    filename: optimizedFilename,
    context,
    mime_type: optimized.mime,
  };

  // Append to images array
  const currentImages = Array.isArray(item.images) ? item.images : [];
  const updatedImages = [...currentImages, newImage];

  const { error: updateErr } = await supabase
    .from('seo_calendar_items')
    .update({ images: updatedImages, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (updateErr) return errorResponse(updateErr.message, 500);

  const savings = optimized.skipped ? null : {
    original_kb: Math.round(optimized.originalSize / 1024),
    optimized_kb: Math.round(optimized.optimizedSize / 1024),
    reduction_pct: Math.round((1 - optimized.optimizedSize / optimized.originalSize) * 100),
  };

  return successResponse({ ...newImage, optimization: savings }, 201);
}

/**
 * DELETE /api/seo/calendars/[id]/items/[itemId]/images
 * Remove an image by storage_path (sent in body).
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id, itemId } = await params;

  const body = await request.json().catch(() => null);
  const storagePath = body?.storage_path;
  if (!storagePath) return errorResponse('storage_path is required');

  const { data: item } = await supabase
    .from('seo_calendar_items')
    .select('id, status, images, calendar_id')
    .eq('id', itemId)
    .eq('calendar_id', id)
    .single();

  if (!item) return errorResponse('Item not found', 404);
  if (item.status === 'launched') return errorResponse('Cannot modify a launched item', 400);

  // Remove from storage
  await supabase.storage.from('seo-calendar-images').remove([storagePath]);

  // Remove from images array
  const currentImages = Array.isArray(item.images) ? item.images : [];
  const updatedImages = currentImages.filter(
    (img: { storage_path: string }) => img.storage_path !== storagePath
  );

  const { error } = await supabase
    .from('seo_calendar_items')
    .update({ images: updatedImages, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) return errorResponse(error.message, 500);

  return successResponse({ deleted: true });
}

/**
 * PATCH /api/seo/calendars/[id]/items/[itemId]/images
 * Update context text for a specific image.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id, itemId } = await params;

  const body = await request.json().catch(() => null);
  const { storage_path, context } = body || {};
  if (!storage_path) return errorResponse('storage_path is required');

  const { data: item } = await supabase
    .from('seo_calendar_items')
    .select('id, status, images, calendar_id')
    .eq('id', itemId)
    .eq('calendar_id', id)
    .single();

  if (!item) return errorResponse('Item not found', 404);
  if (item.status === 'launched') return errorResponse('Cannot modify a launched item', 400);

  const currentImages = Array.isArray(item.images) ? item.images : [];
  const updatedImages = currentImages.map(
    (img: { storage_path: string; context: string | null }) =>
      img.storage_path === storage_path ? { ...img, context: context || null } : img
  );

  const { error } = await supabase
    .from('seo_calendar_items')
    .update({ images: updatedImages, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) return errorResponse(error.message, 500);

  return successResponse({ updated: true });
}
