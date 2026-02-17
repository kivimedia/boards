import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { deleteFromS3 } from '@/lib/s3';

interface Params {
  params: { id: string; attachmentId: string };
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id: cardId, attachmentId } = params;

  // Fetch the attachment to get the storage path
  const { data: attachment, error: fetchError } = await supabase
    .from('attachments')
    .select('*')
    .eq('id', attachmentId)
    .eq('card_id', cardId)
    .single();

  if (fetchError || !attachment) return errorResponse('Attachment not found', 404);

  const storagePath: string = attachment.storage_path;

  // Delete from the appropriate storage backend
  if (storagePath.startsWith('s3://')) {
    // S3 file
    try {
      await deleteFromS3(storagePath.replace('s3://', ''));
    } catch (err: any) {
      return errorResponse(`Failed to delete file from S3: ${err.message}`, 500);
    }
  } else if (attachment.mime_type !== 'text/uri-list') {
    // Supabase Storage file (skip link-type attachments)
    const { error: storageError } = await supabase.storage
      .from('card-attachments')
      .remove([storagePath]);

    if (storageError) {
      return errorResponse(`Failed to delete file from storage: ${storageError.message}`, 500);
    }
  }

  // Delete the DB record
  const { error: deleteError } = await supabase
    .from('attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('card_id', cardId);

  if (deleteError) return errorResponse(deleteError.message, 500);

  // Log activity
  await supabase.from('activity_log').insert({
    card_id: cardId,
    user_id: userId,
    event_type: 'attachment_deleted',
    metadata: {
      attachment_id: attachmentId,
      file_name: attachment.file_name,
    },
  });

  return successResponse({ deleted: true });
}
