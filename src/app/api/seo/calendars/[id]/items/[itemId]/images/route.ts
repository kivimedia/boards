import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

type Params = { params: Promise<{ id: string; itemId: string }> };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * POST /api/seo/calendars/[id]/items/[itemId]/images
 * Upload an image to a calendar item.
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

  // Upload to public bucket
  const storagePath = `${itemId}/${Date.now()}_${file.name}`;
  const { error: uploadErr } = await supabase.storage
    .from('seo-calendar-images')
    .upload(storagePath, file);

  if (uploadErr) return errorResponse(`Upload failed: ${uploadErr.message}`, 500);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('seo-calendar-images')
    .getPublicUrl(storagePath);

  const newImage = {
    storage_path: storagePath,
    url: urlData.publicUrl,
    filename: file.name,
    context,
    mime_type: file.type,
  };

  // Append to images array
  const currentImages = Array.isArray(item.images) ? item.images : [];
  const updatedImages = [...currentImages, newImage];

  const { error: updateErr } = await supabase
    .from('seo_calendar_items')
    .update({ images: updatedImages, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (updateErr) return errorResponse(updateErr.message, 500);

  return successResponse(newImage, 201);
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
