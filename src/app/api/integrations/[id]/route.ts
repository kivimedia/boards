import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getIntegration, updateIntegration, deleteIntegration } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const integration = await getIntegration(auth.ctx.supabase, id);

  if (!integration) return errorResponse('Integration not found', 404);
  return successResponse(integration);
}

interface UpdateIntegrationBody {
  name?: string;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await parseBody<UpdateIntegrationBody>(request);
  if (!body.ok) return body.response;

  const updates: Record<string, unknown> = {};
  if (body.body.name !== undefined) updates.name = body.body.name.trim();
  if (body.body.is_active !== undefined) updates.is_active = body.body.is_active;
  if (body.body.metadata !== undefined) updates.metadata = body.body.metadata;

  if (Object.keys(updates).length === 0) return errorResponse('No updates provided');

  const integration = await updateIntegration(auth.ctx.supabase, id, updates);
  if (!integration) return errorResponse('Failed to update integration', 500);
  return successResponse(integration);
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  await deleteIntegration(auth.ctx.supabase, id);
  return successResponse({ deleted: true });
}
