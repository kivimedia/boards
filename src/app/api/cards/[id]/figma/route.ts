import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getFigmaEmbeds, createFigmaEmbed } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const embeds = await getFigmaEmbeds(auth.ctx.supabase, id);
  return successResponse(embeds);
}

interface CreateFigmaEmbedBody {
  integration_id: string;
  figma_file_key: string;
  figma_node_id?: string;
  figma_url: string;
  embed_type: 'file' | 'frame' | 'component' | 'prototype';
  title?: string;
  thumbnail_url?: string;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await parseBody<CreateFigmaEmbedBody>(request);
  if (!body.ok) return body.response;

  const { integration_id, figma_file_key, figma_url, embed_type } = body.body;

  if (!integration_id) return errorResponse('Integration ID is required');
  if (!figma_file_key?.trim()) return errorResponse('Figma file key is required');
  if (!figma_url?.trim()) return errorResponse('Figma URL is required');
  if (!embed_type) return errorResponse('Embed type is required');
  if (!['file', 'frame', 'component', 'prototype'].includes(embed_type)) {
    return errorResponse('Invalid embed type');
  }

  const embed = await createFigmaEmbed(auth.ctx.supabase, {
    integrationId: integration_id,
    cardId: id,
    figmaFileKey: figma_file_key.trim(),
    figmaNodeId: body.body.figma_node_id,
    figmaUrl: figma_url.trim(),
    embedType: embed_type,
    title: body.body.title,
    thumbnailUrl: body.body.thumbnail_url,
  });

  if (!embed) return errorResponse('Failed to create Figma embed', 500);
  return successResponse(embed, 201);
}
