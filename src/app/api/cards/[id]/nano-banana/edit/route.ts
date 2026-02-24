import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { editImage, saveNanoBananaResult } from '@/lib/ai/nano-banana';

interface Params {
  params: { id: string };
}

interface EditBody {
  attachmentId: string;
  editInstruction: string;
}

/**
 * POST /api/cards/[id]/nano-banana/edit
 * Edit an existing image attachment using Nano Banana (Gemini image edit).
 *
 * Body:
 *   attachmentId: string (required) - The attachment to edit
 *   editInstruction: string (required) - Natural language instruction for the edit
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<EditBody>(request);
  if (!body.ok) return body.response;

  const { attachmentId, editInstruction } = body.body;
  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  if (!attachmentId) {
    return errorResponse('attachmentId is required');
  }

  if (!editInstruction) {
    return errorResponse('editInstruction is required');
  }

  try {
    // 1. Fetch the attachment record
    const { data: attachment, error: attachmentError } = await supabase
      .from('attachments')
      .select('id, file_name, mime_type, storage_path')
      .eq('id', attachmentId)
      .eq('card_id', cardId)
      .single();

    if (attachmentError || !attachment) {
      return errorResponse('Attachment not found', 404);
    }

    // 2. Download the image from Supabase storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('card-attachments')
      .download(attachment.storage_path);

    if (downloadError || !fileData) {
      return errorResponse('Failed to download attachment image', 500);
    }

    // 3. Convert to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const imageBase64 = Buffer.from(arrayBuffer).toString('base64');

    // 4. Resolve board_id from card -> card_placements -> lists -> board
    const { data: placement } = await supabase
      .from('card_placements')
      .select('list:lists(board_id)')
      .eq('card_id', cardId)
      .limit(1)
      .single();

    const boardId = placement?.list
      ? (placement.list as unknown as { board_id: string }).board_id
      : undefined;

    // 5. Call editImage
    const output = await editImage(supabase, {
      cardId,
      userId,
      boardId,
      attachmentId,
      imageBase64,
      mimeType: attachment.mime_type,
      editInstruction,
    });

    // 6. Save result as new attachment
    const editedFileName = `edited_${attachment.file_name}`;
    const newAttachmentId = await saveNanoBananaResult(
      supabase,
      cardId,
      userId,
      output,
      editedFileName,
      attachmentId
    );

    if (!newAttachmentId) {
      return errorResponse('Image was edited but failed to save the result', 500);
    }

    return successResponse({ attachmentId: newAttachmentId }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('Budget exceeded')) {
      return errorResponse(message, 429);
    }

    if (message.includes('not configured') || message.includes('API key')) {
      return errorResponse(message, 422);
    }

    return errorResponse(`Image edit failed: ${message}`, 500);
  }
}
