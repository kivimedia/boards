import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

type Params = { params: Promise<{ id: string }> };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * POST /api/seo/runs/[id]/feedback/upload
 * Upload a review image attachment.
 * Accepts multipart/form-data with a `file` field.
 */
export async function POST(
  request: NextRequest,
  { params }: Params
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id: runId } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return errorResponse('No file provided');

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(`File too large. Maximum size is 10MB.`);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return errorResponse(`Invalid file type. Allowed: JPEG, PNG, GIF, WebP`);
    }

    // Upload to Supabase Storage
    const storagePath = `${runId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('seo-review-attachments')
      .upload(storagePath, file);

    if (uploadError) {
      return errorResponse(`Upload failed: ${uploadError.message}`, 500);
    }

    // Create attachment record (no feedback_id yet - linked when feedback is submitted)
    const { data, error } = await supabase
      .from('seo_review_attachments')
      .insert({
        run_id: runId,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: storagePath,
        uploaded_by: userId,
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);

    // Generate signed URL for immediate display
    const { data: urlData } = await supabase.storage
      .from('seo-review-attachments')
      .createSignedUrl(storagePath, 3600);

    return successResponse({
      ...data,
      url: urlData?.signedUrl || null,
    }, 201);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Upload failed', 500);
  }
}
