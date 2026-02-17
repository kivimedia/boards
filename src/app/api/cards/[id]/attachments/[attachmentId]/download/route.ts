import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { getS3DownloadUrl } from '@/lib/s3';
import { NextResponse } from 'next/server';

interface Params {
  params: { id: string; attachmentId: string };
}

/**
 * GET /api/cards/[id]/attachments/[attachmentId]/download
 * Returns a download URL for the attachment.
 * For S3 files (storage_path starts with "s3://"), generates a presigned URL.
 * For Supabase files, generates a signed URL.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id: cardId, attachmentId } = params;

  // Fetch the attachment record
  const { data: attachment, error } = await supabase
    .from('attachments')
    .select('storage_path, mime_type, file_name')
    .eq('id', attachmentId)
    .eq('card_id', cardId)
    .single();

  if (error || !attachment) return errorResponse('Attachment not found', 404);

  const storagePath: string = attachment.storage_path;

  // S3 file — generate presigned URL
  if (storagePath.startsWith('s3://')) {
    const s3Key = storagePath.replace('s3://', '');
    try {
      const url = await getS3DownloadUrl(s3Key, 3600); // 1 hour expiry
      return NextResponse.json({ data: { url, source: 's3' } });
    } catch (err: any) {
      return errorResponse(`Failed to generate S3 download URL: ${err.message}`, 500);
    }
  }

  // Link-type attachment — just return the URL
  if (attachment.mime_type === 'text/uri-list') {
    return NextResponse.json({ data: { url: storagePath, source: 'link' } });
  }

  // Supabase Storage — generate signed URL
  const { data: signedData, error: signedError } = await supabase.storage
    .from('card-attachments')
    .createSignedUrl(storagePath, 3600);

  if (signedError || !signedData?.signedUrl) {
    return errorResponse('Failed to generate download URL', 500);
  }

  return NextResponse.json({ data: { url: signedData.signedUrl, source: 'supabase' } });
}
