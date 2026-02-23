import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { NextResponse } from 'next/server';

const BUCKET = 'chat-attachments';
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Sanitize a filename for safe storage paths.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 100);
}

/**
 * POST /api/chat/upload
 * Upload a file attachment for AI chat.
 * Accepts multipart/form-data with a `file` field.
 * Returns { url, name, type }.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let file: File | null = null;
  try {
    const formData = await request.formData();
    file = formData.get('file') as File | null;
  } catch {
    return errorResponse('Failed to parse form data');
  }

  if (!file) return errorResponse('No file provided');
  if (file.size > MAX_SIZE) return errorResponse('File must be under 20MB');

  const originalName = file.name || 'upload';
  const sanitized = sanitizeFilename(originalName);
  const storagePath = `${userId}/${Date.now()}-${sanitized}`;
  const mimeType = file.type || 'application/octet-stream';
  const isImage = mimeType.startsWith('image/');
  const attachmentType: 'image' | 'file' = isImage ? 'image' : 'file';

  // Try upload; if bucket doesn't exist, try with upsert which may auto-create
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    // Bucket may not exist — return a descriptive error
    return errorResponse(
      `File upload failed: ${uploadError.message}. Ensure the "${BUCKET}" storage bucket exists in Supabase.`,
      500
    );
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  const url = urlData?.publicUrl ?? '';

  return NextResponse.json({ url, name: originalName, type: attachmentType }, { status: 200 });
}
