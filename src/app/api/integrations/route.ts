import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getIntegrations, createIntegration } from '@/lib/integrations';
import type { IntegrationProvider } from '@/lib/types';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider') as IntegrationProvider | null;

  const integrations = await getIntegrations(auth.ctx.supabase, provider ?? undefined);
  return successResponse(integrations);
}

interface CreateIntegrationBody {
  provider: IntegrationProvider;
  name: string;
  workspace_id?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateIntegrationBody>(request);
  if (!body.ok) return body.response;

  const { provider, name, workspace_id, metadata } = body.body;

  if (!provider) return errorResponse('Provider is required');
  if (!['slack', 'github', 'figma'].includes(provider)) return errorResponse('Invalid provider');
  if (!name?.trim()) return errorResponse('Name is required');

  const integration = await createIntegration(auth.ctx.supabase, {
    provider,
    name: name.trim(),
    workspaceId: workspace_id,
    metadata,
    connectedBy: auth.ctx.userId,
  });

  if (!integration) return errorResponse('Failed to create integration', 500);
  return successResponse(integration, 201);
}
