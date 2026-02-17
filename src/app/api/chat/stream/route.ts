import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { streamChatMessage, getChatSession } from '@/lib/ai/chatbot-stream';
import { detectClientPrefix } from '@/lib/ai/chatbot';
import { queryClientBrain } from '@/lib/ai/client-brain';
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

  // Check for "For [Client]: ..." prefix in all_boards scope → delegate to brain
  if (scope === 'all_boards' && !confirmedAction) {
    const prefix = detectClientPrefix(message);
    if (prefix) {
      // Look up client by name
      const { data: clientMatch } = await supabase
        .from('clients')
        .select('id, name')
        .ilike('name', `%${prefix.clientName}%`)
        .limit(1)
        .single();

      if (clientMatch) {
        // Route to client brain
        const encoder = new TextEncoder();
        const brainStream = new ReadableStream({
          async start(controller) {
            const emit = (data: Record<string, unknown>) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            try {
              const brainResult = await queryClientBrain(supabase, {
                clientId: clientMatch.id,
                userId,
                query: prefix.query,
              });

              // Stream the brain response as tokens (simulate streaming)
              const responseText = brainResult.response;
              // Emit full response as a single token for simplicity
              emit({ type: 'token', content: `🧠 **Client Brain — ${clientMatch.name}**\n\n${responseText}` });

              // Add sources if available
              if (brainResult.sources?.length) {
                const sourcesText = `\n\n---\n**Sources** (${brainResult.sources.length}):\n${brainResult.sources.map((s: { title: string; similarity: number }) => `• ${s.title} (${Math.round(s.similarity * 100)}%)`).join('\n')}`;
                emit({ type: 'token', content: sourcesText });
              }

              emit({
                type: 'done',
                sessionId: null,
                inputTokens: brainResult.inputTokens || 0,
                outputTokens: brainResult.outputTokens || 0,
                modelUsed: brainResult.modelUsed || 'unknown',
              });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              emit({ type: 'error', message: `Brain query failed: ${errMsg}` });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(brainStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }
    }
  }

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
