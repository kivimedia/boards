import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import {
  getChatSession,
  archiveChatSession,
  deleteChatSession,
} from '@/lib/ai/chatbot';

interface Params {
  params: { sessionId: string };
}

/**
 * GET /api/chat/[sessionId]
 * Get a single chat session by ID.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { sessionId } = params;

  try {
    const session = await getChatSession(supabase, sessionId);

    if (!session) {
      return errorResponse('Chat session not found', 404);
    }

    if (session.user_id !== userId) {
      return errorResponse('Unauthorized', 401);
    }

    return successResponse(session);
  } catch (err) {
    return errorResponse(
      `Failed to fetch chat session: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

/**
 * DELETE /api/chat/[sessionId]
 * Delete a chat session.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { sessionId } = params;

  try {
    // Verify session exists and belongs to the user
    const session = await getChatSession(supabase, sessionId);

    if (!session) {
      return errorResponse('Chat session not found', 404);
    }

    if (session.user_id !== userId) {
      return errorResponse('Unauthorized', 401);
    }

    await deleteChatSession(supabase, sessionId);
    return successResponse({ deleted: true });
  } catch (err) {
    return errorResponse(
      `Failed to delete chat session: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface ArchiveBody {
  archived: boolean;
}

/**
 * PATCH /api/chat/[sessionId]
 * Archive (or unarchive) a chat session.
 *
 * Body:
 *   archived: boolean (required)
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<ArchiveBody>(request);
  if (!body.ok) return body.response;

  const { archived } = body.body;
  const { supabase, userId } = auth.ctx;
  const { sessionId } = params;

  if (typeof archived !== 'boolean') {
    return errorResponse('archived must be a boolean');
  }

  try {
    // Verify session exists and belongs to the user
    const session = await getChatSession(supabase, sessionId);

    if (!session) {
      return errorResponse('Chat session not found', 404);
    }

    if (session.user_id !== userId) {
      return errorResponse('Unauthorized', 401);
    }

    if (archived) {
      await archiveChatSession(supabase, sessionId);
    } else {
      // Unarchive: update directly since there's no dedicated function
      await supabase
        .from('chat_sessions')
        .update({ is_archived: false })
        .eq('id', sessionId);
    }

    return successResponse({ sessionId, archived });
  } catch (err) {
    return errorResponse(
      `Failed to update chat session: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
