import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { deleteWhatsAppGroup } from '@/lib/whatsapp';

/**
 * DELETE /api/whatsapp/groups/[groupId]
 * Delete a WhatsApp group mapping.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { groupId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { groupId } = params;

  if (!groupId) {
    return errorResponse('groupId is required');
  }

  const { supabase } = auth.ctx;

  await deleteWhatsAppGroup(supabase, groupId);

  return successResponse({ deleted: true });
}
