import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * POST /api/cards/[id]/description-images
 * Upload an image pasted into the card description editor.
 * Returns a long-lived signed URL (10 years) for embedding in markdown.
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

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) return errorResponse('Image must be under 10MB');

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const storagePath = `description-images/${cardId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('card-attachments')
    .upload(storagePath, file, { contentType: file.type || 'image/png', upsert: false });

  if (uploadError) {
    return errorResponse(`Upload failed: ${uploadError.message}`, 500);
  }

  // 10-year signed URL — long enough for practical permanence
  const { data: signedData } = await supabase.storage
    .from('card-attachments')
    .createSignedUrl(storagePath, 315_360_000);

  if (!signedData?.signedUrl) {
    return errorResponse('Failed to generate image URL', 500);
  }

  return successResponse({ url: signedData.signedUrl });
}
