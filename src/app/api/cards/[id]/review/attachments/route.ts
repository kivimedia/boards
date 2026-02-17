import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/[id]/review/attachments
 * List image attachments for a card with version history.
 * Useful for selecting which attachment to review and its previous version.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  const { data, error } = await supabase
    .from('attachments')
    .select('id, card_id, file_name, mime_type, storage_path, version, parent_attachment_id, created_at')
    .eq('card_id', cardId)
    .like('mime_type', 'image/%')
    .order('version', { ascending: false });

  if (error) {
    return errorResponse(`Failed to fetch image attachments: ${error.message}`, 500);
  }

  return successResponse(data ?? []);
}
