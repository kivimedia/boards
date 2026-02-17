import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { isS3Configured, uploadToS3, buildS3Key } from '@/lib/s3';

// Allow up to 500MB uploads + 5 min timeout for large files
export const maxDuration = 300;

interface Params {
  params: { id: string };
}

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/**
 * POST /api/cards/[id]/attachments/upload
 * Upload a file as attachment. Routes to S3 for large files (>50MB),
 * or Supabase Storage for smaller files.
 *
 * Accepts multipart/form-data with a `file` field.
 * Returns the storage_path and method used.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return errorResponse('No file provided');
    }

    if (file.size > MAX_FILE_SIZE) {
      return errorResponse(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
    }

    const SUPABASE_MAX = 50 * 1024 * 1024; // 50MB
    let storagePath: string;
    let storageMethod: 'supabase' | 's3';

    if (file.size > SUPABASE_MAX) {
      // Large file → S3
      if (!isS3Configured()) {
        return errorResponse(
          'File exceeds 50MB Supabase limit. Configure AWS S3 (AWS_S3_ACCESS_KEY_ID, AWS_S3_SECRET_ACCESS_KEY, AWS_S3_BUCKET) for large file uploads.'
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const s3Key = buildS3Key(cardId, file.name);
      await uploadToS3(s3Key, buffer, file.type || 'application/octet-stream');

      storagePath = `s3://${s3Key}`;
      storageMethod = 's3';
    } else {
      // Small file → Supabase Storage
      const path = `${cardId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('card-attachments')
        .upload(path, file);

      if (uploadError) {
        return errorResponse(`Storage upload failed: ${uploadError.message}`, 500);
      }

      storagePath = path;
      storageMethod = 'supabase';
    }

    // Create attachment record in DB
    const { data, error } = await supabase
      .from('attachments')
      .insert({
        card_id: cardId,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        storage_path: storagePath,
        uploaded_by: userId,
      })
      .select('*')
      .single();

    if (error) {
      return errorResponse(error.message, 500);
    }

    // Log activity
    await supabase.from('activity_log').insert({
      card_id: cardId,
      user_id: userId,
      event_type: 'attachment_uploaded',
      metadata: {
        attachment_id: data.id,
        file_name: data.file_name,
        file_size: data.file_size,
        mime_type: data.mime_type,
        storage_method: storageMethod,
      },
    });

    return successResponse({
      ...data,
      storage_method: storageMethod,
    }, 201);
  } catch (err: any) {
    return errorResponse(`Upload failed: ${err.message}`, 500);
  }
}

