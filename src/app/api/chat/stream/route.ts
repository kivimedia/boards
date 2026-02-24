import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

function detectProvider(modelId: string): 'anthropic' | 'openai' | 'google' {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3')) return 'openai';
  if (modelId.startsWith('gemini-')) return 'google';
  return 'anthropic';
}

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
          // 1. Resolve model config
          const modelConfig = await resolveModelWithFallback(supabase, activity);
          const modelId = (model_override && model_override.trim())
            ? model_override.trim()
            : modelConfig.model_id;

          // 2. Detect provider and get API key
          const provider = detectProvider(modelId);
          let apiKey: string | null = null;
          if (provider === 'openai') {
            apiKey = await getProviderKey(supabase, 'openai');
            if (!apiKey) {
              emitEvent(controller, 'error', { type: 'error', error: 'OpenAI API key not configured', message: 'OpenAI API key not configured' });
              controller.close();
              return;
            }
          } else if (provider === 'google') {
            apiKey = await getProviderKey(supabase, 'google');
            if (!apiKey) {
              emitEvent(controller, 'error', { type: 'error', error: 'Google AI API key not configured', message: 'Google AI API key not configured' });
              controller.close();
              return;
            }
          } else {
            apiKey = await getProviderKey(supabase, 'anthropic');
            if (!apiKey) {
              emitEvent(controller, 'error', { type: 'error', error: 'Anthropic API key not configured', message: 'Anthropic API key not configured' });
              controller.close();
              return;
            }
          }

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

          // 7. Stream from provider
          let fullText = '';
          let inputTokens = 0;
          let outputTokens = 0;

          if (provider === 'openai') {
            const openai = new OpenAI({ apiKey: apiKey! });
            // Build OpenAI messages format
            const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
            if (fullSystemPrompt) {
              openaiMessages.push({ role: 'system', content: fullSystemPrompt });
            }
            for (const m of anthropicMessages) {
              if (typeof m.content === 'string') {
                openaiMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
              } else {
                const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
                for (const block of m.content as { type: string; text?: string; source?: { url: string } }[]) {
                  if (block.type === 'text' && block.text) {
                    parts.push({ type: 'text', text: block.text });
                  } else if (block.type === 'image' && block.source?.url) {
                    parts.push({ type: 'image_url', image_url: { url: block.source.url } });
                  }
                }
                if (m.role === 'user') {
                  openaiMessages.push({ role: 'user', content: parts });
                } else {
                  // Assistant messages with array content — extract text only
                  const textContent = parts
                    .filter((p): p is OpenAI.Chat.ChatCompletionContentPartText => p.type === 'text')
                    .map(p => p.text).join('');
                  openaiMessages.push({ role: 'assistant', content: textContent });
                }
              }
            }
            const openaiStream = await openai.chat.completions.create({
              model: modelId,
              messages: openaiMessages,
              stream: true,
              max_tokens: 4096,
              stream_options: { include_usage: true },
            });
            for await (const chunk of openaiStream) {
              const text = chunk.choices[0]?.delta?.content ?? '';
              if (text) {
                fullText += text;
                emitEvent(controller, 'token', { type: 'token', content: text, text });
              }
              if (chunk.usage) {
                inputTokens = chunk.usage.prompt_tokens ?? 0;
                outputTokens = chunk.usage.completion_tokens ?? 0;
              }
            }
          } else if (provider === 'google') {
            const genai = new GoogleGenerativeAI(apiKey!);
            const geminiModel = genai.getGenerativeModel({ model: modelId });
            // Build Gemini history (all messages except the last user message)
            const geminiHistory = anthropicMessages.slice(0, -1).map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: typeof m.content === 'string'
                ? [{ text: m.content }]
                : (m.content as { type: string; text?: string }[])
                    .filter(b => b.type === 'text' && b.text)
                    .map(b => ({ text: (b as { text: string }).text })),
            }));
            const lastMsg = anthropicMessages[anthropicMessages.length - 1];
            type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
            const lastParts: GeminiPart[] = typeof lastMsg.content === 'string'
              ? [{ text: lastMsg.content }]
              : (lastMsg.content as { type: string; text?: string; source?: { url: string } }[]).flatMap((b): GeminiPart[] => {
                  if (b.type === 'text' && b.text) return [{ text: b.text }];
                  if (b.type === 'image' && b.source?.url) return [{ inlineData: { mimeType: 'image/jpeg', data: b.source.url.split(',')[1] ?? b.source.url } }];
                  return [];
                });
            const chat = geminiModel.startChat({
              history: geminiHistory,
              systemInstruction: fullSystemPrompt || undefined,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const geminiStream = await chat.sendMessageStream(lastParts as any);
            for await (const chunk of geminiStream.stream) {
              const text = chunk.text();
              if (text) {
                fullText += text;
                emitEvent(controller, 'token', { type: 'token', content: text, text });
              }
            }
            const geminiResult = await geminiStream.response;
            inputTokens = geminiResult.usageMetadata?.promptTokenCount ?? 0;
            outputTokens = geminiResult.usageMetadata?.candidatesTokenCount ?? 0;
          } else {
            // Anthropic (original path)
            const anthropicClient = new Anthropic({ apiKey: apiKey! });
            const claudeStream = anthropicClient.messages.stream({
              model: modelId,
              max_tokens: 4096,
              temperature: modelConfig.temperature,
              system: fullSystemPrompt,
              messages: anthropicMessages,
            });
            for await (const event of claudeStream) {
              if (
                event.type === 'content_block_delta' &&
                (event.delta as { type: string }).type === 'text_delta'
              ) {
                const text = (event.delta as { text: string }).text;
                fullText += text;
                emitEvent(controller, 'token', { type: 'token', content: text, text });
              }
            }
            const finalMsg = await claudeStream.finalMessage();
            inputTokens = finalMsg.usage.input_tokens;
            outputTokens = finalMsg.usage.output_tokens;
          }

          const latencyMs = Date.now() - startTime;

          // 8. Log usage
          try {
            await logUsage(supabase, {
              userId,
              boardId,
              cardId,
              activity,
              provider,
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
