import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { deactivateDocument } from '@/lib/ai/client-brain';

interface Params {
  params: { clientId: string; documentId: string };
}

/**
 * DELETE /api/clients/[clientId]/brain/documents/[documentId]
 * Deactivate (soft-delete) a brain document.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { documentId } = params;

  try {
    await deactivateDocument(supabase, documentId);
    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(
      `Failed to deactivate document: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
