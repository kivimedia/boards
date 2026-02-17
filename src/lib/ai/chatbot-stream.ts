import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient, touchApiKey } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import { getSystemPrompt } from './prompt-templates';
import {
  buildTicketContext,
  buildBoardContext,
  buildGlobalContext,
  formatContextForPrompt,
  getChatSession,
  searchWikiForContext,
} from './chatbot';
import {
  CHAT_TOOLS,
  executeTool,
  needsConfirmation,
  buildConfirmationMessage,
  formatToolResult,
} from './chat-tools';
import {
  processCardAttachments,
  formatFilesAsContext,
  type ProcessedFile,
} from './file-processor';
import type {
  ChatScope,
  ChatMessage,
  ChatContext,
  ChatToolExecution,
  AIActivity,
} from '../types';

// ============================================================================
// STREAMING CHAT ENGINE (with Tool Use support)
// ============================================================================

function scopeToActivity(scope: ChatScope): AIActivity {
  switch (scope) {
    case 'ticket':
      return 'chatbot_ticket';
    case 'board':
      return 'chatbot_board';
    case 'all_boards':
      return 'chatbot_global';
  }
}

export interface StreamChatInput {
  sessionId?: string;
  userId: string;
  boardId?: string;
  cardId?: string;
  scope: ChatScope;
  message: string;
  previousMessages?: ChatMessage[];
  includeAttachments?: boolean;
  /** If set, a previously-requested tool action has been confirmed by the user */
  confirmedAction?: {
    toolName: string;
    toolInput: Record<string, unknown>;
  };
}

export interface StreamChatOutput {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string;
  fullReply: string;
  toolExecutions?: ChatToolExecution[];
  /** If set, the assistant wants to use a tool that requires user confirmation */
  pendingConfirmation?: {
    toolName: string;
    toolInput: Record<string, unknown>;
    confirmationMessage: string;
  };
}

/** Max tool-use loop iterations to prevent runaway */
const MAX_TOOL_ITERATIONS = 5;

/**
 * Stream a chat message token-by-token with tool use support.
 * Calls onToken() for each text delta, onToolResult() for tool execution results.
 * Returns final output after stream completes.
 */
export async function streamChatMessage(
  supabase: SupabaseClient,
  input: StreamChatInput,
  onToken: (token: string) => void,
  onError?: (error: string) => void,
  onToolResult?: (toolName: string, result: string) => void
): Promise<StreamChatOutput> {
  const startTime = Date.now();
  const activity = scopeToActivity(input.scope);

  // 1. Budget check
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'anthropic',
    activity,
    userId: input.userId,
    boardId: input.boardId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Resolve model
  const modelConfig = await resolveModelWithFallback(supabase, activity);

  // 3. Create client
  const client = await createAnthropicClient(supabase);
  if (!client) {
    throw new Error('Anthropic API key not configured. Add one in Settings > AI Configuration.');
  }

  // 4. Build context
  let context: ChatContext;
  if (input.scope === 'ticket' && input.cardId) {
    context = await buildTicketContext(supabase, input.cardId, input.userId);
  } else if (input.scope === 'board' && input.boardId) {
    context = await buildBoardContext(supabase, input.boardId, input.userId);
  } else {
    context = await buildGlobalContext(supabase, input.userId);
  }

  // 4b. Enrich with wiki search results (keyword match against user's message)
  try {
    const wikiContext = await searchWikiForContext(supabase, input.message);
    if (wikiContext) {
      context.wiki_context = wikiContext;
    }
  } catch {
    // Wiki search is best-effort — don't fail the chat
  }

  // 4c. Process card attachments if requested
  let processedFiles: ProcessedFile[] = [];
  if (input.includeAttachments && input.cardId) {
    try {
      processedFiles = await processCardAttachments(supabase, input.cardId);
      // Add text content from files to context
      const filesContext = formatFilesAsContext(processedFiles);
      if (filesContext) {
        context.wiki_context = context.wiki_context
          ? `${context.wiki_context}\n\n${filesContext}`
          : filesContext;
      }
    } catch {
      // File processing is best-effort
    }
  }

  // 5. Build messages array
  const systemPrompt = getSystemPrompt(activity);
  const contextString = formatContextForPrompt(context);
  const fullSystemPrompt = `${systemPrompt}\n\n## Context\n${contextString}`;

  const messages: Anthropic.MessageParam[] = [];

  // Add previous messages from session
  if (input.previousMessages && input.previousMessages.length > 0) {
    for (const msg of input.previousMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // Add current message — include images as vision content blocks if available
  const imageFiles = processedFiles.filter((f) => f.type === 'image' && f.base64Data && f.mediaType);
  if (imageFiles.length > 0) {
    const contentBlocks: Anthropic.ContentBlockParam[] = [
      { type: 'text', text: input.message },
    ];
    for (const img of imageFiles) {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType!,
          data: img.base64Data!,
        },
      });
    }
    messages.push({ role: 'user', content: contentBlocks });
  } else {
    messages.push({ role: 'user', content: input.message });
  }

  // Determine if we should provide tools (only in ticket scope where card_id is available)
  const shouldProvideTools = input.scope === 'ticket' && !!input.cardId;

  // 6. Handle pre-confirmed action (user approved a pending tool)
  if (input.confirmedAction) {
    const result = await executeTool(
      supabase,
      input.userId,
      input.confirmedAction.toolName,
      input.confirmedAction.toolInput
    );
    const formatted = formatToolResult(result);
    onToken(formatted);
    onToolResult?.(input.confirmedAction.toolName, formatted);

    return {
      sessionId: input.sessionId ?? crypto.randomUUID(),
      inputTokens: 0,
      outputTokens: 0,
      modelUsed: modelConfig.model_id,
      fullReply: formatted,
      toolExecutions: [{
        tool_name: input.confirmedAction.toolName,
        tool_input: input.confirmedAction.toolInput,
        result: formatted,
        timestamp: new Date().toISOString(),
      }],
    };
  }

  // 7. Agentic streaming loop (handles tool_use + continuation)
  let fullReply = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const toolExecutions: ChatToolExecution[] = [];
  let pendingConfirmation: StreamChatOutput['pendingConfirmation'] | undefined;

  try {
    let currentMessages = [...messages];
    let iteration = 0;

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      const streamParams: Anthropic.MessageCreateParams = {
        model: modelConfig.model_id,
        max_tokens: modelConfig.max_tokens,
        temperature: modelConfig.temperature,
        system: fullSystemPrompt,
        messages: currentMessages,
      };

      // Only include tools in ticket scope
      if (shouldProvideTools) {
        streamParams.tools = CHAT_TOOLS;
      }

      const stream = client.messages.stream(streamParams);

      // Collect content blocks from the stream
      let streamText = '';
      const toolUseBlocks: { id: string; name: string; input: Record<string, unknown> }[] = [];
      let currentToolName = '';
      let currentToolId = '';
      let currentToolInput = '';

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolName = event.content_block.name;
            currentToolId = event.content_block.id;
            currentToolInput = '';
          }
        } else if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const text = event.delta.text;
          streamText += text;
          fullReply += text;
          onToken(text);
        } else if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'input_json_delta'
        ) {
          currentToolInput += event.delta.partial_json;
        } else if (event.type === 'content_block_stop') {
          if (currentToolName && currentToolId) {
            try {
              const parsedInput = JSON.parse(currentToolInput || '{}');
              toolUseBlocks.push({
                id: currentToolId,
                name: currentToolName,
                input: parsedInput,
              });
            } catch {
              // Skip malformed tool input
            }
            currentToolName = '';
            currentToolId = '';
            currentToolInput = '';
          }
        }
      }

      // Get final message for token counts
      const finalMessage = await stream.finalMessage();
      totalInputTokens += finalMessage.usage.input_tokens;
      totalOutputTokens += finalMessage.usage.output_tokens;

      // If no tool use, we're done
      if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== 'tool_use') {
        break;
      }

      // Process tool_use blocks
      const assistantContent: Anthropic.ContentBlockParam[] = [];
      if (streamText) {
        assistantContent.push({ type: 'text', text: streamText });
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tool of toolUseBlocks) {
        assistantContent.push({
          type: 'tool_use',
          id: tool.id,
          name: tool.name,
          input: tool.input,
        });

        // Inject card_id from context if not provided
        if (!tool.input.card_id && input.cardId) {
          tool.input.card_id = input.cardId;
        }

        // Check if this tool needs user confirmation
        if (needsConfirmation(tool.name)) {
          pendingConfirmation = {
            toolName: tool.name,
            toolInput: tool.input,
            confirmationMessage: buildConfirmationMessage(tool.name, tool.input),
          };

          // Send a message about needing confirmation and stop
          const confirmMsg = `\n\n🔔 **Action required:** ${pendingConfirmation.confirmationMessage}`;
          fullReply += confirmMsg;
          onToken(confirmMsg);

          // Return a synthetic tool result that tells Claude the action is pending
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: 'Action pending user confirmation. The user will decide whether to proceed.',
          });

          // Don't execute more tools
          break;
        }

        // Execute the tool
        const result = await executeTool(supabase, input.userId, tool.name, tool.input);
        const formatted = formatToolResult(result);

        toolExecutions.push({
          tool_name: tool.name,
          tool_input: tool.input,
          result: formatted,
          timestamp: new Date().toISOString(),
        });

        onToolResult?.(tool.name, formatted);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: formatted,
        });
      }

      // If we have a pending confirmation, stop the loop
      if (pendingConfirmation) {
        break;
      }

      // Continue the conversation with tool results
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: assistantContent },
        { role: 'user', content: toolResults },
      ];
    }
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    await logUsage(supabase, {
      userId: input.userId,
      boardId: input.boardId,
      cardId: input.cardId,
      activity,
      provider: 'anthropic',
      modelId: modelConfig.model_id,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`Chat stream failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const latencyMs = Date.now() - startTime;
  await touchApiKey(supabase, 'anthropic');

  // 8. Log usage
  await logUsage(supabase, {
    userId: input.userId,
    boardId: input.boardId,
    cardId: input.cardId,
    activity,
    provider: 'anthropic',
    modelId: modelConfig.model_id,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    latencyMs,
    status: 'success',
  });

  // 9. Persist session
  const now = new Date().toISOString();
  const userMsg: ChatMessage = {
    role: 'user',
    content: input.message,
    timestamp: now,
    tokens: totalInputTokens,
  };
  const assistantMsg: ChatMessage = {
    role: 'assistant',
    content: fullReply,
    timestamp: now,
    tokens: totalOutputTokens,
    tool_executions: toolExecutions.length > 0 ? toolExecutions : undefined,
  };

  let sessionId = input.sessionId;

  if (sessionId) {
    const { data: existing } = await supabase
      .from('chat_sessions')
      .select('messages, message_count, total_tokens')
      .eq('id', sessionId)
      .single();

    if (existing) {
      const updatedMessages = [...(existing.messages as ChatMessage[]), userMsg, assistantMsg];
      await supabase
        .from('chat_sessions')
        .update({
          messages: updatedMessages,
          message_count: existing.message_count + 2,
          total_tokens: existing.total_tokens + totalInputTokens + totalOutputTokens,
          model_used: modelConfig.model_id,
        })
        .eq('id', sessionId);
    }
  } else {
    const title = input.message.slice(0, 100) + (input.message.length > 100 ? '...' : '');
    const { data: newSession } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: input.userId,
        scope: input.scope,
        card_id: input.cardId ?? null,
        board_id: input.boardId ?? null,
        title,
        messages: [userMsg, assistantMsg],
        message_count: 2,
        total_tokens: totalInputTokens + totalOutputTokens,
        model_used: modelConfig.model_id,
      })
      .select('id')
      .single();

    sessionId = newSession?.id ?? crypto.randomUUID();
  }

  return {
    sessionId: sessionId!,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    modelUsed: modelConfig.model_id,
    fullReply,
    toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
    pendingConfirmation,
  };
}

export { getChatSession };
