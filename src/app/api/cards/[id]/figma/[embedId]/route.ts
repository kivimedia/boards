import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { deleteFigmaEmbed } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ id: string; embedId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { embedId } = await params;
  if (!embedId) return errorResponse('Embed ID is required');

  await deleteFigmaEmbed(auth.ctx.supabase, embedId);
  return successResponse({ deleted: true });
}
