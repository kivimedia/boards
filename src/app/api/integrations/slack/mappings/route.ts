import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getSlackMappings, createSlackMapping } from '@/lib/integrations';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get('board_id') ?? undefined;

  const mappings = await getSlackMappings(auth.ctx.supabase, boardId);
  return successResponse(mappings);
}

interface CreateSlackMappingBody {
  integration_id: string;
  board_id: string;
  channel_id: string;
  channel_name: string;
  notify_card_created?: boolean;
  notify_card_moved?: boolean;
  notify_card_completed?: boolean;
  notify_comments?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateSlackMappingBody>(request);
  if (!body.ok) return body.response;

  const { integration_id, board_id, channel_id, channel_name } = body.body;

  if (!integration_id) return errorResponse('Integration ID is required');
  if (!board_id) return errorResponse('Board ID is required');
  if (!channel_id) return errorResponse('Channel ID is required');
  if (!channel_name?.trim()) return errorResponse('Channel name is required');

  const mapping = await createSlackMapping(auth.ctx.supabase, {
    integrationId: integration_id,
    boardId: board_id,
    channelId: channel_id,
    channelName: channel_name.trim(),
    notifyCardCreated: body.body.notify_card_created,
    notifyCardMoved: body.body.notify_card_moved,
    notifyCardCompleted: body.body.notify_card_completed,
    notifyComments: body.body.notify_comments,
  });

  if (!mapping) return errorResponse('Failed to create Slack mapping', 500);
  return successResponse(mapping, 201);
}
