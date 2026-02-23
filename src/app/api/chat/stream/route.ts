import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { streamChatMessage, getChatSession } from '@/lib/ai/chatbot-stream';
import {
  detectClientPrefix,
  buildTicketContext,
  buildBoardContext,
  buildGlobalContext,
  formatContextForPrompt,
  searchWikiForContext,
} from '@/lib/ai/chatbot';
import { queryClientBrain } from '@/lib/ai/client-brain';
import { getProviderKey } from '@/lib/ai/providers';
import { resolveModelWithFallback } from '@/lib/ai/model-resolver';
import { logUsage } from '@/lib/ai/cost-tracker';
import { getSystemPrompt } from '@/lib/ai/prompt-templates';
import type { ChatScope, ChatMessage } from '@/lib/types';

export const maxDuration = 120;

interface Attachment {
  type: 'image' | 'file';
  url: string;
  name: string;
}

interface StreamMessageBody {
  scope: ChatScope;
  message: string;
  sessionId?: string;
  cardId?: string;
  boardId?: string;
  // Legacy params (ChatPanel)
  includeAttachments?: boolean;
  confirmedAction?: {
    toolName: string;
    toolInput: Record<string, unknown>;
  };
  // New params (CardAIChat)
  model_override?: string;
  attachments?: Attachment[];
}

function scopeToActivity(scope: ChatScope) {
  switch (scope) {
    case 'ticket': return 'chatbot_ticket' as const;
    case 'board': return 'chatbot_board' as const;
    case 'all_boards': return 'chatbot_global' as const;
  }
}

/**
 * POST /api/chat/stream
 * Stream a chat response via Server-Sent Events.
 *
 * Emits combined SSE format compatible with both ChatPanel and CardAIChat:
 *   event: token
 *   data: {"type":"token","content":"...","text":"..."}
 *
 *   event: complete
 *   data: {"type":"done","session_id":"...","sessionId":"...","model_used":"...","inputTokens":N,"outputTokens":N}
 *
 *   event: error
 *   data: {"type":"error","error":"...","message":"..."}
 *
 *   event: confirmation_required
 *   data: {"type":"confirmation_required","toolName":"...","toolInput":{...},"message":"..."}
 *
 *   event: tool_result
 *   data: {"type":"tool_result","toolName":"...","result":"..."}
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

  const {
    scope,
    message,
    sessionId,
    cardId,
    boardId,
    includeAttachments,
    confirmedAction,
    model_override,
    attachments,
  } = body;
  const { supabase, userId } = auth.ctx;

  // Validate
  if (!scope) return errorResponse('scope is required');
  if (!message && (!attachments || attachments.length === 0)) return errorResponse('message is required');
  if (scope === 'ticket' && !cardId) return errorResponse('cardId is required for ticket scope');
  if (scope === 'board' && !boardId) return errorResponse('boardId is required for board scope');

  const encoder = new TextEncoder();

  // Emit combined SSE event (compatible with both ChatPanel and new CardAIChat)
  const emitEvent = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    eventName: string,
    data: Record<string, unknown>
  ) => {
    controller.enqueue(
      encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
    );
  };

  // ─── NEW CARD AI CHAT PATH ───────────────────────────────────────────────
  // When model_override is present, use the simplified direct-streaming path
  // that supports model override and file attachments without tool use.
  if (model_override !== undefined || (attachments && attachments.length > 0)) {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const startTime = Date.now();
        const activity = scopeToActivity(scope);

        try {
          // 1. Get API key and create client
          const apiKey = await getProviderKey(supabase, 'anthropic');
          if (!apiKey) {
            emitEvent(controller, 'error', {
              type: 'error',
              error: 'Anthropic API key not configured',
              message: 'Anthropic API key not configured',
            });
            controller.close();
            return;
          }
          const client = new Anthropic({ apiKey });

          // 2. Resolve model config
          const modelConfig = await resolveModelWithFallback(supabase, activity);
          const modelId = (model_override && model_override.trim())
            ? model_override.trim()
            : modelConfig.model_id;

          // 3. Load previous messages if session exists
          let previousMessages: ChatMessage[] | undefined;
          if (sessionId) {
            const { data: session } = await supabase
              .from('chat_sessions')
              .select('*')
              .eq('id', sessionId)
              .single();
            if (!session) {
              emitEvent(controller, 'error', {
                type: 'error',
                error: 'Chat session not found',
                message: 'Chat session not found',
              });
              controller.close();
              return;
            }
            if (session.user_id !== userId) {
              emitEvent(controller, 'error', {
                type: 'error',
                error: 'Unauthorized',
                message: 'Unauthorized',
              });
              controller.close();
              return;
            }
            previousMessages = session.messages as ChatMessage[];
          }

          // 4. Build context
          let contextStr = '';
          try {
            let chatContext;
            if (scope === 'ticket' && cardId) {
              chatContext = await buildTicketContext(supabase, cardId, userId);
            } else if (scope === 'board' && boardId) {
              chatContext = await buildBoardContext(supabase, boardId, userId);
            } else {
              chatContext = await buildGlobalContext(supabase, userId);
            }
            // Enrich with wiki
            try {
              const wikiCtx = await searchWikiForContext(supabase, message || '');
              if (wikiCtx) chatContext.wiki_context = wikiCtx;
            } catch { /* best-effort */ }
            contextStr = formatContextForPrompt(chatContext);
          } catch {
            // Non-fatal: proceed without context
          }

          // 5. Build system prompt
          const systemPrompt = getSystemPrompt(activity);
          const fullSystemPrompt = contextStr
            ? `${systemPrompt}\n\n## Context\n${contextStr}`
            : systemPrompt;

          // 6. Build messages array
          const anthropicMessages: Anthropic.MessageParam[] = [];

          // Previous messages
          if (previousMessages && previousMessages.length > 0) {
            for (const msg of previousMessages) {
              if (msg.role === 'user' || msg.role === 'assistant') {
                anthropicMessages.push({ role: msg.role, content: msg.content });
              }
            }
          }

          // Current user message
          const msgAttachments = attachments ?? [];
          if (msgAttachments.length > 0) {
            const contentParts: Anthropic.MessageParam['content'] = [
              ...msgAttachments.map((a): Anthropic.ContentBlockParam => {
                if (a.type === 'image') {
                  return {
                    type: 'image',
                    source: { type: 'url', url: a.url } as Anthropic.URLImageSource,
                  };
                }
                return {
                  type: 'text',
                  text: `[Attached file: ${a.name} — ${a.url}]`,
                };
              }),
              { type: 'text', text: message || '' },
            ];
            anthropicMessages.push({ role: 'user', content: contentParts });
          } else {
            anthropicMessages.push({ role: 'user', content: message || '' });
          }

          // 7. Stream from Claude
          const claudeStream = client.messages.stream({
            model: modelId,
            max_tokens: 4096,
            temperature: modelConfig.temperature,
            system: fullSystemPrompt,
            messages: anthropicMessages,
          });

          let fullText = '';
          for await (const event of claudeStream) {
            if (
              event.type === 'content_block_delta' &&
              (event.delta as { type: string }).type === 'text_delta'
            ) {
              const text = (event.delta as { text: string }).text;
              fullText += text;
              emitEvent(controller, 'token', {
                type: 'token',
                content: text,
                text,
              });
            }
          }

          // Get final message for usage stats
          const finalMsg = await claudeStream.finalMessage();
          const inputTokens = finalMsg.usage.input_tokens;
          const outputTokens = finalMsg.usage.output_tokens;
          const latencyMs = Date.now() - startTime;

          // 8. Log usage
          try {
            await logUsage(supabase, {
              userId,
              boardId,
              cardId,
              activity,
              provider: 'anthropic',
              modelId,
              inputTokens,
              outputTokens,
              latencyMs,
              status: 'success',
            });
          } catch { /* best-effort */ }

          // 9. Upsert session
          const now = new Date().toISOString();
          const userChatMsg: ChatMessage = {
            role: 'user',
            content: message || '',
            timestamp: now,
            tokens: inputTokens,
          };
          const assistantChatMsg: ChatMessage = {
            role: 'assistant',
            content: fullText,
            timestamp: now,
            tokens: outputTokens,
          };

          let finalSessionId = sessionId;

          if (sessionId) {
            // Update existing session
            const { data: existing } = await supabase
              .from('chat_sessions')
              .select('messages, message_count, total_tokens')
              .eq('id', sessionId)
              .single();

            if (existing) {
              const updatedMessages = [
                ...((existing.messages as ChatMessage[]) || []),
                userChatMsg,
                assistantChatMsg,
              ];
              await supabase
                .from('chat_sessions')
                .update({
                  messages: updatedMessages,
                  message_count: (existing.message_count || 0) + 2,
                  total_tokens: (existing.total_tokens || 0) + inputTokens + outputTokens,
                  model_used: modelId,
                  updated_at: now,
                })
                .eq('id', sessionId);
            }
          } else {
            // Create new session
            const title = (message || '').slice(0, 60) || 'Chat';
            const { data: newSession } = await supabase
              .from('chat_sessions')
              .insert({
                user_id: userId,
                scope,
                card_id: cardId ?? null,
                board_id: boardId ?? null,
                title,
                messages: [userChatMsg, assistantChatMsg],
                message_count: 2,
                total_tokens: inputTokens + outputTokens,
                model_used: modelId,
              })
              .select('id')
              .single();

            finalSessionId = newSession?.id ?? undefined;
          }

          // 10. Emit complete event
          emitEvent(controller, 'complete', {
            type: 'done',
            session_id: finalSessionId,
            sessionId: finalSessionId,
            model_used: modelId,
            modelUsed: modelId,
            inputTokens,
            outputTokens,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          emitEvent(controller, 'error', {
            type: 'error',
            error: errMsg,
            message: errMsg,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      },
    });
  }

  // ─── LEGACY CHAT PANEL PATH ──────────────────────────────────────────────
  // (tool use, confirmation, includeAttachments, etc.)

  // Check for "For [Client]: ..." prefix in all_boards scope → delegate to brain
  if (scope === 'all_boards' && !confirmedAction) {
    const prefix = detectClientPrefix(message);
    if (prefix) {
      const { data: clientMatch } = await supabase
        .from('clients')
        .select('id, name')
        .ilike('name', `%${prefix.clientName}%`)
        .limit(1)
        .single();

      if (clientMatch) {
        const brainStream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              const brainResult = await queryClientBrain(supabase, {
                clientId: clientMatch.id,
                userId,
                query: prefix.query,
              });

              const responseText = brainResult.response;
              emitEvent(controller, 'token', {
                type: 'token',
                content: `🧠 **Client Brain — ${clientMatch.name}**\n\n${responseText}`,
                text: `🧠 **Client Brain — ${clientMatch.name}**\n\n${responseText}`,
              });

              if (brainResult.sources?.length) {
                const sourcesText = `\n\n---\n**Sources** (${brainResult.sources.length}):\n${brainResult.sources.map((s: { title: string; similarity: number }) => `• ${s.title} (${Math.round(s.similarity * 100)}%)`).join('\n')}`;
                emitEvent(controller, 'token', {
                  type: 'token',
                  content: sourcesText,
                  text: sourcesText,
                });
              }

              emitEvent(controller, 'complete', {
                type: 'done',
                session_id: null,
                sessionId: null,
                model_used: brainResult.modelUsed || 'unknown',
                inputTokens: brainResult.inputTokens || 0,
                outputTokens: brainResult.outputTokens || 0,
              });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              emitEvent(controller, 'error', {
                type: 'error',
                error: `Brain query failed: ${errMsg}`,
                message: `Brain query failed: ${errMsg}`,
              });
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

  const legacyStream = new ReadableStream<Uint8Array>({
    async start(controller) {
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
          (token: string) => {
            emitEvent(controller, 'token', {
              type: 'token',
              content: token,
              text: token,
            });
          },
          (error: string) => {
            emitEvent(controller, 'error', {
              type: 'error',
              error,
              message: error,
            });
          },
          (toolName: string, toolResult: string) => {
            emitEvent(controller, 'tool_result', {
              type: 'tool_result',
              toolName,
              result: toolResult,
            });
          }
        );

        if (result.pendingConfirmation) {
          emitEvent(controller, 'confirmation_required', {
            type: 'confirmation_required',
            toolName: result.pendingConfirmation.toolName,
            toolInput: result.pendingConfirmation.toolInput,
            message: result.pendingConfirmation.confirmationMessage,
          });
        }

        emitEvent(controller, 'complete', {
          type: 'done',
          session_id: result.sessionId,
          sessionId: result.sessionId,
          model_used: result.modelUsed,
          modelUsed: result.modelUsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          toolExecutions: result.toolExecutions,
        });
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        emitEvent(controller, 'error', {
          type: 'error',
          error: errMessage,
          message: errMessage,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(legacyStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
