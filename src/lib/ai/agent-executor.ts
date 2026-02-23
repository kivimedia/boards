import { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient } from './providers';
import { calculateCost, logUsage } from './cost-tracker';
import {
  createExecution,
  completeExecution,
  updateCardAgentTask,
  getSkill,
  getBoardAgent,
  createToolCall,
  completeToolCall,
} from '../agent-engine';
import {
  getAgentToolDefinitions,
  executeAgentTool,
  needsAgentConfirmation,
  buildAgentConfirmationMessage,
  shouldIncludeWebSearch,
} from './agent-tools';
import { gatherBoardContext, boardContextToText, type BoardContext } from '../board-context';
import type { MultiTurnExecutionCallbacks } from '../types';

// ============================================================================
// AGENT EXECUTOR -- Multi-turn tool-use loop (upgraded from single-turn)
// ============================================================================

const MAX_AGENT_ITERATIONS = 10;

export interface ExecuteAgentParams {
  taskId: string;
  skillId: string;
  boardAgentId?: string;
  cardId: string;
  boardId: string;
  userId: string;
  inputPrompt?: string;
}

export interface ExecuteAgentCallbacks {
  onToken: (text: string) => void;
  onComplete: (output: string) => void;
  onError: (error: string) => void;
}

export interface MultiTurnAgentCallbacks extends ExecuteAgentCallbacks {
  onToolCall?: (name: string, input: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string, success: boolean) => void;
  onThinking?: (summary: string) => void;
  onConfirmationNeeded?: (toolCallId: string, name: string, input: Record<string, unknown>, message: string) => void;
}

/**
 * Build context about a card to feed to the agent.
 */
async function buildCardContext(
  supabase: SupabaseClient,
  cardId: string
): Promise<{ contextText: string; contextJson: Record<string, unknown> }> {
  const { data: card } = await supabase
    .from('cards')
    .select('id, title, description, priority, due_date, created_at')
    .eq('id', cardId)
    .single();

  const { data: labels } = await supabase
    .from('card_labels')
    .select('label:labels(name, color)')
    .eq('card_id', cardId);

  const { data: comments } = await supabase
    .from('comments')
    .select('content, created_at, profile:profiles(display_name)')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: checklists } = await supabase
    .from('checklists')
    .select('title, items:checklist_items(title, is_completed)')
    .eq('card_id', cardId);

  const { data: brief } = await supabase
    .from('briefs')
    .select('content, brief_type')
    .eq('card_id', cardId)
    .limit(1)
    .maybeSingle();

  const { data: customFields } = await supabase
    .from('card_custom_field_values')
    .select('value, field:custom_fields(name, field_type)')
    .eq('card_id', cardId);

  const contextJson: Record<string, unknown> = {
    card,
    labels: labels?.map((l: any) => l.label?.name).filter(Boolean) ?? [],
    comments: comments?.map((c: any) => ({
      by: c.profile?.display_name,
      content: c.content,
      at: c.created_at,
    })) ?? [],
    checklists: checklists?.map((cl: any) => ({
      title: cl.title,
      items: cl.items?.map((i: any) => `${i.is_completed ? '[x]' : '[ ]'} ${i.title}`),
    })) ?? [],
    brief: brief?.content ?? null,
    customFields: customFields?.map((cf: any) => ({
      name: cf.field?.name,
      value: cf.value,
    })) ?? [],
  };

  const parts: string[] = [];
  parts.push(`# Card: ${card?.title ?? 'Untitled'}`);
  if (card?.description) parts.push(`\n## Description\n${card.description}`);
  if (card?.priority && card.priority !== 'none') parts.push(`\nPriority: ${card.priority}`);
  if (card?.due_date) parts.push(`Due: ${card.due_date}`);

  const labelNames = labels?.map((l: any) => l.label?.name).filter(Boolean) ?? [];
  if (labelNames.length) parts.push(`\nLabels: ${labelNames.join(', ')}`);

  if (brief?.content) parts.push(`\n## Brief\n${brief.content}`);

  if (checklists?.length) {
    for (const cl of checklists as any[]) {
      parts.push(`\n## Checklist: ${cl.title}`);
      for (const item of cl.items ?? []) {
        parts.push(`${item.is_completed ? '- [x]' : '- [ ]'} ${item.title}`);
      }
    }
  }

  if (customFields?.length) {
    parts.push('\n## Custom Fields');
    for (const cf of customFields as any[]) {
      if (cf.field?.name) parts.push(`- ${cf.field.name}: ${cf.value}`);
    }
  }

  if (comments?.length) {
    parts.push('\n## Recent Comments');
    for (const c of (comments as any[]).reverse()) {
      parts.push(`- ${c.profile?.display_name ?? 'Unknown'}: ${c.content}`);
    }
  }

  return { contextText: parts.join('\n'), contextJson };
}

/**
 * Execute an agent skill against a card, streaming the output.
 * Supports multi-turn tool use when skill has supported_tools.
 */
export async function executeAgentSkill(
  supabase: SupabaseClient,
  params: ExecuteAgentParams,
  callbacks: MultiTurnAgentCallbacks
): Promise<void> {
  const startTime = Date.now();
  let executionId: string | null = null;

  try {
    // 1. Load the skill
    const skill = await getSkill(supabase, params.skillId);
    if (!skill) throw new Error('Skill not found');

    // 2. Load board agent if provided
    let boardAgent = null;
    if (params.boardAgentId) {
      boardAgent = await getBoardAgent(supabase, params.boardAgentId);
    }

    // 3. Build card context
    const { contextText, contextJson } = await buildCardContext(supabase, params.cardId);

    // 4. Build board context for tools (if board_id provided and skill has tools)
    let boardContext: BoardContext | null = null;
    const tools = getAgentToolDefinitions(skill, boardAgent);
    const hasTools = tools.length > 0;
    if (hasTools && params.boardId) {
      boardContext = await gatherBoardContext(supabase, params.boardId);
    }

    // 5. Build the user message
    let userMessage = contextText;
    if (boardContext) {
      userMessage += `\n\n## Board Context\n${boardContextToText(boardContext)}`;
    }
    if (params.inputPrompt) {
      userMessage += `\n\n## Additional Instructions\n${params.inputPrompt}`;
    }

    // 6. Build system prompt (skill prompt + board-level additions)
    let systemPrompt = skill.system_prompt;
    if (boardAgent?.custom_prompt_additions) {
      systemPrompt += `\n\n## Board-Specific Context\n${boardAgent.custom_prompt_additions}`;
    }
    if (hasTools) {
      systemPrompt += '\n\nYou have tools available. Use them to gather information and take actions. Use the think tool to reason through complex problems before acting. Be concise in your responses.';
    }

    // 7. Create execution record
    const execution = await createExecution(supabase, {
      board_agent_id: params.boardAgentId!,
      skill_id: params.skillId,
      board_id: params.boardId,
      card_id: params.cardId,
      user_id: params.userId,
      trigger_type: 'manual',
      input_message: userMessage,
      input_context: contextJson,
    });
    executionId = execution.id;

    // 8. Update task status to running
    if (params.taskId) {
      await updateCardAgentTask(supabase, params.taskId, {
        status: 'running',
        execution_id: executionId,
      });
    }

    // 9. Create Anthropic client
    const client = await createAnthropicClient(supabase);
    if (!client) throw new Error('Anthropic API key not configured. Go to Settings > AI Keys to add one.');

    // 10. Determine model
    const modelId = boardAgent?.model_preference || 'claude-sonnet-4-5-20250929';
    const maxIterations = boardAgent?.max_iterations || MAX_AGENT_ITERATIONS;

    // 11. Agentic loop (multi-turn if tools available, single-turn otherwise)
    let fullOutput = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let toolCallCount = 0;
    let pendingConfirmation = false;

    let currentMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage },
    ];

    // Build tools array (include web_search as server tool if needed)
    const streamTools: Anthropic.Tool[] = [...tools];
    const includeWebSearch = shouldIncludeWebSearch(skill);

    let iteration = 0;
    while (iteration < maxIterations) {
      iteration++;

      const streamParams: Anthropic.MessageCreateParams = {
        model: modelId,
        max_tokens: Math.min(skill.estimated_tokens * 2, 8192),
        system: systemPrompt,
        messages: currentMessages,
      };

      if (hasTools) {
        streamParams.tools = streamTools;
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
          fullOutput += text;
          callbacks.onToken(text);
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

        toolCallCount++;

        // Notify about tool call
        callbacks.onToolCall?.(tool.name, tool.input);

        // Handle think tool specially
        if (tool.name === 'think') {
          const reasoning = String(tool.input.reasoning ?? '').slice(0, 100);
          callbacks.onThinking?.(`Reasoning: ${reasoning}...`);

          // Record in DB
          if (executionId) {
            const tc = await createToolCall(supabase, executionId, {
              tool_name: 'think',
              tool_input: tool.input,
              call_order: toolCallCount,
            }).catch(() => null);
            if (tc) {
              await completeToolCall(supabase, tc.id, {
                tool_result: { reasoning: tool.input.reasoning },
                status: 'success',
              }).catch(() => {});
            }
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: 'Reasoning recorded. Continue with your analysis.',
          });
          continue;
        }

        // Check if this tool needs user confirmation
        if (needsAgentConfirmation(tool.name, boardAgent)) {
          const confirmMessage = buildAgentConfirmationMessage(tool.name, tool.input);

          // Record pending tool call
          let pendingToolCallId: string | undefined;
          if (executionId) {
            const tc = await createToolCall(supabase, executionId, {
              tool_name: tool.name,
              tool_input: tool.input,
              call_order: toolCallCount,
            }).catch(() => null);
            if (tc) {
              pendingToolCallId = tc.id;
              await completeToolCall(supabase, tc.id, {
                tool_result: {},
                status: 'pending_confirmation',
              }).catch(() => {});
            }
          }

          // Save message history for resume
          if (executionId) {
            await supabase.from('agent_executions').update({
              message_history: [
                ...currentMessages,
                { role: 'assistant', content: assistantContent },
              ],
              status: 'pending_confirmation',
              tool_call_count: toolCallCount,
            }).eq('id', executionId);
          }

          callbacks.onConfirmationNeeded?.(
            pendingToolCallId || tool.id,
            tool.name,
            tool.input,
            confirmMessage
          );

          const confirmMsg = `\n\nAction requires confirmation: ${confirmMessage}`;
          fullOutput += confirmMsg;
          callbacks.onToken(confirmMsg);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: 'Action pending user confirmation.',
          });

          pendingConfirmation = true;
          break;
        }

        // Execute the tool
        const toolStart = Date.now();
        const result = await executeAgentTool(
          supabase,
          params.userId,
          params.boardId,
          tool.name,
          tool.input,
          boardContext
        );
        const toolDuration = Date.now() - toolStart;

        const formatted = result.success ? `OK: ${result.message}` : `ERROR: ${result.message}`;
        callbacks.onToolResult?.(tool.name, formatted, result.success);

        // Record in DB
        if (executionId) {
          const tc = await createToolCall(supabase, executionId, {
            tool_name: tool.name,
            tool_input: tool.input,
            call_order: toolCallCount,
          }).catch(() => null);
          if (tc) {
            await completeToolCall(supabase, tc.id, {
              tool_result: { message: result.message, data: result.data },
              status: result.success ? 'success' : 'failed',
              duration_ms: toolDuration,
            }).catch(() => {});
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: formatted,
        });
      }

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

    const costUsd = calculateCost('anthropic', modelId, totalInputTokens, totalOutputTokens);
    const durationMs = Date.now() - startTime;

    if (pendingConfirmation) {
      // Don't complete the execution -- it's paused
      if (params.taskId) {
        await updateCardAgentTask(supabase, params.taskId, {
          status: 'running',
          output_preview: fullOutput.slice(0, 500),
        }).catch(() => {});
      }
      return;
    }

    // Complete execution record
    if (executionId) {
      await completeExecution(supabase, executionId, {
        status: 'success',
        output_response: fullOutput,
        model_used: modelId,
        iterations_used: iteration,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_usd: costUsd,
        duration_ms: durationMs,
      });

      // Update tool call count
      await supabase.from('agent_executions').update({
        tool_call_count: toolCallCount,
      }).eq('id', executionId);
    }

    // Update the task with output
    if (params.taskId) {
      const preview = fullOutput.slice(0, 500);
      await updateCardAgentTask(supabase, params.taskId, {
        status: 'completed',
        output_preview: preview,
        output_full: fullOutput,
        completed_at: new Date().toISOString(),
      });
    }

    // Log usage
    await logUsage(supabase, {
      userId: params.userId,
      boardId: params.boardId,
      cardId: params.cardId,
      activity: 'agent_execution',
      provider: 'anthropic',
      modelId,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      latencyMs: durationMs,
      status: 'success',
      metadata: { skill_slug: skill.slug, task_id: params.taskId, tool_call_count: toolCallCount, iterations: iteration },
    });

    callbacks.onComplete(fullOutput);
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err.message ?? 'Unknown error';

    if (executionId) {
      await completeExecution(supabase, executionId, {
        status: 'failed',
        error_message: errorMsg,
        duration_ms: durationMs,
      }).catch(() => {});
    }

    if (params.taskId) {
      await updateCardAgentTask(supabase, params.taskId, {
        status: 'failed',
      }).catch(() => {});
    }

    callbacks.onError(errorMsg);
  }
}

// ============================================================================
// SESSION-BASED CONVERSATION EXECUTION (multi-turn chat with persistent history)
// ============================================================================

export interface ConversationAgentParams {
  skillId: string;
  boardId?: string;
  userId: string;
  systemPrompt: string;
  messageHistory: Anthropic.MessageParam[];
  newUserMessage: string;
  maxIterations?: number;
  signal?: AbortSignal;
}

export interface ConversationAgentResult {
  updatedMessageHistory: Anthropic.MessageParam[];
  fullOutput: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  toolCallCount: number;
}

/**
 * Execute an agent conversation turn with persistent message history.
 * Used by agent sessions for multi-turn chat.
 */
export async function executeAgentConversation(
  supabase: SupabaseClient,
  params: ConversationAgentParams,
  callbacks: MultiTurnAgentCallbacks
): Promise<ConversationAgentResult> {
  const skill = await getSkill(supabase, params.skillId);
  if (!skill) throw new Error('Skill not found');

  const tools = getAgentToolDefinitions(skill);
  const hasTools = tools.length > 0;

  let boardContext: BoardContext | null = null;
  if (hasTools && params.boardId) {
    boardContext = await gatherBoardContext(supabase, params.boardId);
  }

  let userMessage = params.newUserMessage;
  if (boardContext && params.messageHistory.length === 0) {
    userMessage += `\n\n## Board Context\n${boardContextToText(boardContext)}`;
  }

  const client = await createAnthropicClient(supabase);
  if (!client) throw new Error('Anthropic API key not configured. Go to Settings > AI Keys to add one.');

  const modelId = 'claude-sonnet-4-5-20250929';
  const maxIterations = params.maxIterations || MAX_AGENT_ITERATIONS;

  const currentMessages: Anthropic.MessageParam[] = [
    ...params.messageHistory,
    { role: 'user', content: userMessage },
  ];

  let fullOutput = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolCallCount = 0;

  let iteration = 0;
  while (iteration < maxIterations) {
    if (params.signal?.aborted) break;
    iteration++;

    const streamParams: Anthropic.MessageCreateParams = {
      model: modelId,
      max_tokens: Math.min(skill.estimated_tokens * 2, 8192),
      system: params.systemPrompt,
      messages: currentMessages,
    };
    if (hasTools) streamParams.tools = tools;

    const stream = client.messages.stream(streamParams);

    let streamText = '';
    const toolUseBlocks: { id: string; name: string; input: Record<string, unknown> }[] = [];
    let curToolName = '';
    let curToolId = '';
    let curToolInput = '';

    for await (const event of stream) {
      if (params.signal?.aborted) break;
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        curToolName = event.content_block.name;
        curToolId = event.content_block.id;
        curToolInput = '';
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        streamText += event.delta.text;
        fullOutput += event.delta.text;
        callbacks.onToken(event.delta.text);
      } else if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        curToolInput += event.delta.partial_json;
      } else if (event.type === 'content_block_stop' && curToolName && curToolId) {
        try { toolUseBlocks.push({ id: curToolId, name: curToolName, input: JSON.parse(curToolInput || '{}') }); } catch {}
        curToolName = ''; curToolId = ''; curToolInput = '';
      }
    }

    if (params.signal?.aborted) break;

    const finalMessage = await stream.finalMessage();
    totalInputTokens += finalMessage.usage.input_tokens;
    totalOutputTokens += finalMessage.usage.output_tokens;

    if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== 'tool_use') {
      if (streamText) currentMessages.push({ role: 'assistant', content: streamText });
      break;
    }

    const assistantContent: Anthropic.ContentBlockParam[] = [];
    if (streamText) assistantContent.push({ type: 'text', text: streamText });
    const toolResultsArr: Anthropic.ToolResultBlockParam[] = [];

    for (const tool of toolUseBlocks) {
      assistantContent.push({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input });
      toolCallCount++;
      callbacks.onToolCall?.(tool.name, tool.input);

      if (tool.name === 'think') {
        callbacks.onThinking?.(String(tool.input.reasoning ?? '').slice(0, 100));
        toolResultsArr.push({ type: 'tool_result', tool_use_id: tool.id, content: 'Reasoning recorded.' });
        continue;
      }

      const result = await executeAgentTool(supabase, params.userId, params.boardId || '', tool.name, tool.input, boardContext);
      const formatted = result.success ? `OK: ${result.message}` : `ERROR: ${result.message}`;
      callbacks.onToolResult?.(tool.name, formatted, result.success);
      toolResultsArr.push({ type: 'tool_result', tool_use_id: tool.id, content: formatted });
    }

    currentMessages.push(
      { role: 'assistant', content: assistantContent },
      { role: 'user', content: toolResultsArr },
    );
  }

  const costUsd = calculateCost('anthropic', modelId, totalInputTokens, totalOutputTokens);

  await logUsage(supabase, {
    userId: params.userId,
    boardId: params.boardId,
    activity: 'agent_session_turn',
    provider: 'anthropic',
    modelId,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    latencyMs: Date.now() - (Date.now() - totalInputTokens), // approx
    status: params.signal?.aborted ? 'cancelled' : 'success',
    metadata: { skill_slug: skill.slug, tool_call_count: toolCallCount, iterations: iteration },
  });

  return { updatedMessageHistory: currentMessages, fullOutput, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd, toolCallCount };
}

// ============================================================================
// STANDALONE MULTI-TURN EXECUTION (no card context, used by /api/agents/run)
// ============================================================================

// ============================================================================
// PLANNING PROTOCOL — injected into ALL agents when planningMode = true.
// Teaches agents to clarify before acting, regardless of their skill prompt.
// ============================================================================
const PLANNING_PROTOCOL = `
## Planning Phase Protocol
You are currently in PLANNING MODE. Before executing anything:

1. **Briefly explain** what you will do (2-4 sentences, plain English — no jargon).
2. **List any information you need** from the user to do a great job (be specific).
3. **Ask your clarification questions** clearly and concisely.
4. End with: "Ready to start — reply 'go' to begin, or answer my questions first."

Do NOT use any action tools (create, update, delete, post) during this phase.
Read-only tools (search, fetch, think) are OK to use if you need context.
Wait for the user to confirm before doing anything.
`.trim();

export interface StandaloneAgentParams {
  skillId: string;
  boardId?: string;
  cardId?: string;
  userId: string;
  inputMessage: string;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
  planningMode?: boolean;
  maxIterations?: number;
  executionId?: string;
  confirmedToolCallId?: string;
  rejectedToolCallId?: string;
}

/**
 * Execute an agent skill standalone (no card context) with multi-turn tool use.
 */
export async function executeStandaloneAgent(
  supabase: SupabaseClient,
  params: StandaloneAgentParams,
  callbacks: MultiTurnAgentCallbacks
): Promise<void> {
  const startTime = Date.now();

  try {
    // 1. Load the skill
    const skill = await getSkill(supabase, params.skillId);
    if (!skill) throw new Error('Skill not found');

    // 2. Get tools
    const tools = getAgentToolDefinitions(skill);
    const hasTools = tools.length > 0;

    // 3. Build board context if board provided
    let boardContext: BoardContext | null = null;
    if (hasTools && params.boardId) {
      boardContext = await gatherBoardContext(supabase, params.boardId);
    }

    // 4. Build system prompt
    let systemPrompt = skill.system_prompt;
    if (hasTools) {
      systemPrompt += '\n\nYou have tools available. Use them to gather information and take actions. Use the think tool to reason through complex problems before acting.';
    }
    if (params.planningMode) {
      systemPrompt += `\n\n${PLANNING_PROTOCOL}`;
    }

    // 5. Build user message
    let userMessage = params.inputMessage;
    if (boardContext) {
      userMessage += `\n\n## Board Context\n${boardContextToText(boardContext)}`;
    }

    // 6. Create Anthropic client
    const client = await createAnthropicClient(supabase);
    if (!client) throw new Error('Anthropic API key not configured. Go to Settings > AI Keys to add one.');

    const modelId = 'claude-sonnet-4-5-20250929';
    const maxIterations = params.maxIterations || MAX_AGENT_ITERATIONS;

    // 7. Handle resume from confirmation
    let currentMessages: Anthropic.MessageParam[];

    if (params.executionId && (params.confirmedToolCallId || params.rejectedToolCallId)) {
      // Resume from pending confirmation
      const { data: exec } = await supabase
        .from('agent_executions')
        .select('message_history')
        .eq('id', params.executionId)
        .single();

      if (exec?.message_history) {
        currentMessages = exec.message_history as Anthropic.MessageParam[];

        // If confirmed, execute the pending tool and continue
        if (params.confirmedToolCallId) {
          const { data: pendingTc } = await supabase
            .from('agent_tool_calls')
            .select('*')
            .eq('id', params.confirmedToolCallId)
            .single();

          if (pendingTc) {
            // Execute the confirmed tool
            const result = await executeAgentTool(
              supabase, params.userId, params.boardId || '',
              pendingTc.tool_name, pendingTc.tool_input, boardContext
            );
            await completeToolCall(supabase, params.confirmedToolCallId, {
              tool_result: { message: result.message, data: result.data },
              status: result.success ? 'confirmed' : 'failed',
            }).catch(() => {});

            callbacks.onToolResult?.(pendingTc.tool_name, result.message, result.success);

            // Add tool result to messages
            currentMessages.push({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: pendingTc.tool_name, // This is a simplification
                content: result.success ? `OK: ${result.message}` : `ERROR: ${result.message}`,
              }] as any,
            });
          }
        } else if (params.rejectedToolCallId) {
          await completeToolCall(supabase, params.rejectedToolCallId, {
            tool_result: { rejected: true },
            status: 'rejected',
          }).catch(() => {});

          // Tell Claude the action was rejected
          currentMessages.push({
            role: 'user',
            content: 'The user rejected the proposed action. Please continue without performing that action.',
          });
        }
      } else {
        currentMessages = [{ role: 'user', content: userMessage }];
      }
    } else if (params.conversationHistory && params.conversationHistory.length > 0) {
      // Multi-turn conversation (e.g. planning phase → execute)
      currentMessages = [
        ...params.conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: userMessage },
      ];
    } else {
      currentMessages = [{ role: 'user', content: userMessage }];
    }

    // 8. Agentic loop
    let fullOutput = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let toolCallCount = 0;

    let iteration = 0;
    while (iteration < maxIterations) {
      iteration++;

      const streamParams: Anthropic.MessageCreateParams = {
        model: modelId,
        max_tokens: Math.min(skill.estimated_tokens * 2, 8192),
        system: systemPrompt,
        messages: currentMessages,
      };

      if (hasTools) {
        streamParams.tools = tools;
      }

      const stream = client.messages.stream(streamParams);

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
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          streamText += text;
          fullOutput += text;
          callbacks.onToken(text);
        } else if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
          currentToolInput += event.delta.partial_json;
        } else if (event.type === 'content_block_stop') {
          if (currentToolName && currentToolId) {
            try {
              toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: JSON.parse(currentToolInput || '{}') });
            } catch {}
            currentToolName = '';
            currentToolId = '';
            currentToolInput = '';
          }
        }
      }

      const finalMessage = await stream.finalMessage();
      totalInputTokens += finalMessage.usage.input_tokens;
      totalOutputTokens += finalMessage.usage.output_tokens;

      if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== 'tool_use') {
        break;
      }

      // Process tool calls
      const assistantContent: Anthropic.ContentBlockParam[] = [];
      if (streamText) assistantContent.push({ type: 'text', text: streamText });

      const toolResultsArr: Anthropic.ToolResultBlockParam[] = [];

      for (const tool of toolUseBlocks) {
        assistantContent.push({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input });
        toolCallCount++;
        callbacks.onToolCall?.(tool.name, tool.input);

        if (tool.name === 'think') {
          callbacks.onThinking?.(String(tool.input.reasoning ?? '').slice(0, 100));
          toolResultsArr.push({ type: 'tool_result', tool_use_id: tool.id, content: 'Reasoning recorded.' });
          continue;
        }

        const toolStart = Date.now();
        const result = await executeAgentTool(supabase, params.userId, params.boardId || '', tool.name, tool.input, boardContext);
        const formatted = result.success ? `OK: ${result.message}` : `ERROR: ${result.message}`;
        callbacks.onToolResult?.(tool.name, formatted, result.success);

        toolResultsArr.push({ type: 'tool_result', tool_use_id: tool.id, content: formatted });
      }

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: assistantContent },
        { role: 'user', content: toolResultsArr },
      ];
    }

    const costUsd = calculateCost('anthropic', modelId, totalInputTokens, totalOutputTokens);
    const durationMs = Date.now() - startTime;

    // Log usage
    await logUsage(supabase, {
      userId: params.userId,
      boardId: params.boardId,
      activity: 'agent_standalone_execution',
      provider: 'anthropic',
      modelId,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      latencyMs: durationMs,
      status: 'success',
      metadata: { skill_slug: skill.slug, tool_call_count: toolCallCount, iterations: iteration },
    });

    callbacks.onComplete(fullOutput);
  } catch (err: any) {
    callbacks.onError(err.message ?? 'Unknown error');
  }
}
