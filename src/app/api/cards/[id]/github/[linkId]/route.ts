import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { updateGitHubLink, deleteGitHubLink } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ id: string; linkId: string }>;
}

interface UpdateGitHubLinkBody {
  state?: string;
  title?: string;
  last_synced_at?: string;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { linkId } = await params;
  const body = await parseBody<UpdateGitHubLinkBody>(request);
  if (!body.ok) return body.response;

  const updates: Record<string, unknown> = {};
  if (body.body.state !== undefined) updates.state = body.body.state;
  if (body.body.title !== undefined) updates.title = body.body.title;
  if (body.body.last_synced_at !== undefined) updates.last_synced_at = body.body.last_synced_at;

  if (Object.keys(updates).length === 0) return errorResponse('No updates provided');

  const link = await updateGitHubLink(auth.ctx.supabase, linkId, updates);
  if (!link) return errorResponse('Failed to update GitHub link', 500);
  return successResponse(link);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { linkId } = await params;
  await deleteGitHubLink(auth.ctx.supabase, linkId);
  return successResponse({ deleted: true });
}
