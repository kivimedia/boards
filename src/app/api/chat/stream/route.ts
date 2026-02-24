import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { streamChatMessage, getChatSession } from '@/lib/ai/chatbot-stream';
import { detectClientPrefix } from '@/lib/ai/chatbot';
import type { ChatScope, ChatMessage } from '@/lib/types';

export const maxDuration = 120;

interface StreamMessageBody {
  scope: ChatScope;
  message: string;
  sessionId?: string;
  cardId?: string;
  boardId?: string;
  includeAttachments?: boolean;
  /** Pre-confirmed tool action from user approval */
  confirmedAction?: {
    toolName: string;
    toolInput: Record<string, unknown>;
  };
}

/**
 * POST /api/chat/stream
 * Stream a chat response via Server-Sent Events.
 *
 * Events:
 *   data: {"type":"token","content":"..."}\n\n
 *   data: {"type":"tool_result","toolName":"...","result":"..."}\n\n
 *   data: {"type":"confirmation_required","toolName":"...","toolInput":{...},"message":"..."}\n\n
 *   data: {"type":"done","sessionId":"...","inputTokens":N,"outputTokens":N}\n\n
 *   data: {"type":"error","message":"..."}\n\n
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  let body: StreamMessageBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { scope, message, sessionId, cardId, boardId, includeAttachments, confirmedAction } = body;
  const { supabase, userId } = auth.ctx;

  // Validate
  if (!scope) return errorResponse('scope is required');
  if (!message) return errorResponse('message is required');
  if (scope === 'ticket' && !cardId) return errorResponse('cardId is required for ticket scope');
  if (scope === 'board' && !boardId) return errorResponse('boardId is required for board scope');

  // If continuing an existing session, fetch previous messages
  let previousMessages: ChatMessage[] | undefined;
  if (sessionId) {
    const session = await getChatSession(supabase, sessionId);
    if (!session) return errorResponse('Chat session not found', 404);
    if (session.user_id !== userId) return errorResponse('Unauthorized', 401);
    previousMessages = session.messages;
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const result = await streamChatMessage(
          supabase,
          {
            sessionId,
            userId,
            boardId,
            cardId,
            scope,
            message,
            previousMessages,
            includeAttachments,
            confirmedAction,
          },
          // onToken callback
          (token: string) => {
            emit({ type: 'token', content: token });
          },
          // onError callback
          (error: string) => {
            emit({ type: 'error', message: error });
          },
          // onToolResult callback
          (toolName: string, toolResult: string) => {
            emit({ type: 'tool_result', toolName, result: toolResult });
          }
        );

        // Emit confirmation_required event if a tool needs user approval
        if (result.pendingConfirmation) {
          emit({
            type: 'confirmation_required',
            toolName: result.pendingConfirmation.toolName,
            toolInput: result.pendingConfirmation.toolInput,
            message: result.pendingConfirmation.confirmationMessage,
          });
        }

        // Stream complete — emit final event with session metadata
        emit({
          type: 'done',
          sessionId: result.sessionId,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          modelUsed: result.modelUsed,
          toolExecutions: result.toolExecutions,
        });
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        emit({ type: 'error', message: errMessage });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
