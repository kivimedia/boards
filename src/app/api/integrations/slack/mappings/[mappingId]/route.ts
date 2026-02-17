import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { deleteSlackMapping } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ mappingId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { mappingId } = await params;
  if (!mappingId) return errorResponse('Mapping ID is required');

  await deleteSlackMapping(auth.ctx.supabase, mappingId);
  return successResponse({ deleted: true });
}
