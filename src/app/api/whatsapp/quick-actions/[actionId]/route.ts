import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { deleteQuickAction } from '@/lib/whatsapp';

/**
 * DELETE /api/whatsapp/quick-actions/[actionId]
 * Delete a quick action.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { actionId: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { actionId } = params;

  if (!actionId) {
    return errorResponse('actionId is required');
  }

  const { supabase } = auth.ctx;

  await deleteQuickAction(supabase, actionId);

  return successResponse({ deleted: true });
}
