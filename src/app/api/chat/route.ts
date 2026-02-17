import { NextRequest } from 'next/server';
import {
  getAuthContext,
  successResponse,
  errorResponse,
  parseBody,
} from '@/lib/api-helpers';
import {
  sendChatMessage,
  getChatSessions,
  getChatSession,
} from '@/lib/ai/chatbot';
import type { ChatScope, ChatMessage } from '@/lib/types';

interface SendMessageBody {
  scope: ChatScope;
  message: string;
  sessionId?: string;
  cardId?: string;
  boardId?: string;
}

/**
 * POST /api/chat
 * Send a chat message and receive a reply.
 *
 * Body:
 *   scope: ChatScope (required)
 *   message: string (required)
 *   sessionId?: string - Continue an existing session
 *   cardId?: string - Required for ticket scope
 *   boardId?: string - Required for board scope
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<SendMessageBody>(request);
  if (!body.ok) return body.response;

  const { scope, message, sessionId, cardId, boardId } = body.body;
  const { supabase, userId } = auth.ctx;

  if (!scope) {
    return errorResponse('scope is required');
  }

  if (!message) {
    return errorResponse('message is required');
  }

  if (scope === 'ticket' && !cardId) {
    return errorResponse('cardId is required for ticket scope');
  }

  if (scope === 'board' && !boardId) {
    return errorResponse('boardId is required for board scope');
  }

  try {
    // If continuing an existing session, fetch previous messages
    let previousMessages: ChatMessage[] | undefined;

    if (sessionId) {
      const session = await getChatSession(supabase, sessionId);
      if (!session) {
        return errorResponse('Chat session not found', 404);
      }
      if (session.user_id !== userId) {
        return errorResponse('Unauthorized', 401);
      }
      previousMessages = session.messages;
    }

    const result = await sendChatMessage(supabase, {
      sessionId,
      userId,
      boardId,
      cardId,
      scope,
      message,
      previousMessages,
    });

    return successResponse(result, sessionId ? 200 : 201);
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);

    if (errMessage.includes('Budget exceeded')) {
      return errorResponse(errMessage, 429);
    }

    if (errMessage.includes('not configured') || errMessage.includes('API key')) {
      return errorResponse(errMessage, 422);
    }

    return errorResponse(`Chat failed: ${errMessage}`, 500);
  }
}

/**
 * GET /api/chat
 * List chat sessions for the authenticated user.
 *
 * Query params:
 *   scope?: ChatScope - Filter by scope
 *   cardId?: string - Filter by card
 *   boardId?: string - Filter by board
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const scope = searchParams.get('scope') as ChatScope | null;
  const cardId = searchParams.get('cardId') ?? undefined;
  const boardId = searchParams.get('boardId') ?? undefined;

  try {
    const sessions = await getChatSessions(supabase, userId, {
      scope: scope ?? undefined,
      cardId,
      boardId,
    });
    return successResponse(sessions);
  } catch (err) {
    return errorResponse(
      `Failed to fetch chat sessions: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
