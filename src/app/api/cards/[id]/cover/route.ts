import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * POST /api/cards/[id]/cover
 * Upload a cover image for a card (server-side, bypasses client RLS).
 * Accepts multipart/form-data with a `file` field.
 * Uploads to storage, updates card.cover_image_url, returns signedUrl.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  let file: File | null = null;
  try {
    const formData = await request.formData();
    file = formData.get('file') as File | null;
  } catch {
    return errorResponse('Failed to parse form data');
  }

  if (!file) return errorResponse('No file provided');

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB for cover images
  if (file.size > MAX_SIZE) return errorResponse('Cover image must be under 10MB');

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `covers/${cardId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('card-attachments')
    .upload(storagePath, file, { contentType: file.type || 'image/jpeg', upsert: false });

  if (uploadError) {
    return errorResponse(`Storage upload failed: ${uploadError.message}`, 500);
  }

  // Update the card record
  const { error: updateError } = await supabase
    .from('cards')
    .update({ cover_image_url: storagePath })
    .eq('id', cardId);

  if (updateError) {
    return errorResponse(`Failed to save cover: ${updateError.message}`, 500);
  }

  // Return a 1-hour signed URL for immediate display
  const { data: signedData } = await supabase.storage
    .from('card-attachments')
    .createSignedUrl(storagePath, 3600);

  return successResponse({
    storagePath,
    signedUrl: signedData?.signedUrl || null,
  });
}

/**
 * DELETE /api/cards/[id]/cover
 * Remove the cover image from a card.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  const { error } = await supabase
    .from('cards')
    .update({ cover_image_url: null })
    .eq('id', cardId);

  if (error) return errorResponse(error.message, 500);

  return successResponse({ removed: true });
}
