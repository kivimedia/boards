import { Job } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabase.js';
import { getAnthropicClient } from '../lib/anthropic.js';
import { updateJobProgress, markJobRunning, markJobComplete, markJobFailed, markJobPaused } from '../lib/job-reporter.js';
import { loadSkill } from '../shared/agent-helpers.js';
import {
  getAgentToolDefinitions,
  executeAgentTool,
  needsAgentConfirmation,
  buildAgentConfirmationMessage,
  gatherBoardContext,
  boardContextToText,
  type BoardContext,
} from '../shared/agent-tools.js';
import { calculateCost } from '../shared/agent-helpers.js';

// ============================================================================
// STANDALONE AGENT WORKER
// VPS port of executeStandaloneAgent from agent-executor.ts
// Key difference: no SSE streaming - output flushes per iteration via progress_data
// ============================================================================

const MAX_ITERATIONS = 10;
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

export interface AgentStandaloneJobData {
  vps_job_id: string;
  skill_id: string;
  board_id?: string;
  user_id: string;
  input_message: string;
  max_iterations?: number;
  // Resume fields
  resume?: boolean;
  message_history?: Anthropic.MessageParam[];
  pending_tool?: { id: string; name: string; input: Record<string, unknown> };
  confirmation_decision?: 'approve' | 'reject';
}

export async function processAgentStandaloneJob(
  job: Job<AgentStandaloneJobData>
): Promise<void> {
  const data = job.data;
  const { vps_job_id, skill_id, user_id, input_message } = data;
  const startTime = Date.now();

  console.log(`[agent-standalone] Processing job ${vps_job_id}, skill ${skill_id}`);

  try {
    await markJobRunning(vps_job_id);

    // 1. Load the skill
    const skill = await loadSkill(supabase, skill_id);
    if (!skill) throw new Error(`Skill ${skill_id} not found`);

    // 2. Get tools
    const tools = getAgentToolDefinitions(skill);
    const hasTools = tools.length > 0;

    // 3. Build board context if needed
    let boardContext: BoardContext | null = null;
    if (hasTools && data.board_id) {
      boardContext = await gatherBoardContext(supabase, data.board_id);
    }

    // 4. Build system prompt
    let systemPrompt = skill.system_prompt;
    if (hasTools) {
      systemPrompt += '\n\nYou have tools available. Use them to gather information and take actions. Use the think tool to reason through complex problems before acting. Be concise in your responses.';
    }

    // 5. Build initial messages or resume from saved state
    let currentMessages: Anthropic.MessageParam[];

    if (data.resume && data.message_history) {
      currentMessages = data.message_history;

      // Handle confirmation decision
      if (data.pending_tool && data.confirmation_decision) {
        if (data.confirmation_decision === 'approve') {
          // Execute the confirmed tool
          const result = await executeAgentTool(
            supabase, user_id, data.board_id || '',
            data.pending_tool.name, data.pending_tool.input, boardContext
          );
          const formatted = result.success ? `OK: ${result.message}` : `ERROR: ${result.message}`;

          currentMessages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: data.pending_tool.id,
              content: formatted,
            }] as any,
          });

          console.log(`[agent-standalone] Confirmed tool ${data.pending_tool.name}: ${formatted.slice(0, 100)}`);
        } else {
          // Rejected - tell Claude
          currentMessages.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: data.pending_tool.id,
              content: 'The user rejected this action. Continue without performing it.',
            }] as any,
          });
          console.log(`[agent-standalone] Tool ${data.pending_tool.name} rejected by user`);
        }
      }
    } else {
      let userMessage = input_message;
      if (boardContext) {
        userMessage += `\n\n## Board Context\n${boardContextToText(boardContext)}`;
      }
      currentMessages = [{ role: 'user', content: userMessage }];
    }

    // 6. Create Anthropic client
    const client = getAnthropicClient();
    const modelId = DEFAULT_MODEL;
    const maxIterations = data.max_iterations || MAX_ITERATIONS;

    // 7. Agentic loop
    let fullOutput = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let toolCallCount = 0;
    const toolCallLog: { name: string; input: Record<string, unknown>; result: string; success: boolean }[] = [];

    let iteration = 0;
    while (iteration < maxIterations) {
      iteration++;

      const createParams: Anthropic.MessageCreateParams = {
        model: modelId,
        max_tokens: Math.min(skill.estimated_tokens * 2, 8192),
        system: systemPrompt,
        messages: currentMessages,
      };

      if (hasTools) {
        createParams.tools = tools;
      }

      // Non-streaming call (VPS doesn't stream tokens)
      const response = await client.messages.create(createParams);

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Extract text and tool_use blocks
      let iterationText = '';
      const toolUseBlocks: { id: string; name: string; input: Record<string, unknown> }[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          iterationText += block.text;
          fullOutput += block.text;
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        }
      }

      // Update progress after each iteration
      await updateJobProgress(vps_job_id, {
        progress_data: {
          output_so_far: fullOutput,
          iteration,
          max_iterations: maxIterations,
          tool_calls: toolCallLog,
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        },
        progress_message: `Iteration ${iteration}/${maxIterations}`,
      });

      // If no tool use, we're done
      if (toolUseBlocks.length === 0 || response.stop_reason !== 'tool_use') {
        break;
      }

      // Process tool_use blocks
      const assistantContent: Anthropic.ContentBlockParam[] = response.content.map((block) => {
        if (block.type === 'text') return { type: 'text' as const, text: block.text };
        if (block.type === 'tool_use') return { type: 'tool_use' as const, id: block.id, name: block.name, input: block.input };
        return block as any;
      });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tool of toolUseBlocks) {
        toolCallCount++;

        // Handle think tool
        if (tool.name === 'think') {
          toolCallLog.push({ name: 'think', input: tool.input, result: 'Reasoning recorded', success: true });
          toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: 'Reasoning recorded. Continue.' });
          continue;
        }

        // Check if this tool needs user confirmation
        if (needsAgentConfirmation(tool.name)) {
          const confirmMessage = buildAgentConfirmationMessage(tool.name, tool.input);

          // Save state for resume and pause the job
          await updateJobProgress(vps_job_id, {
            status: 'paused',
            progress_message: `Confirmation needed: ${confirmMessage}`,
            progress_data: {
              output_so_far: fullOutput,
              iteration,
              max_iterations: maxIterations,
              tool_calls: toolCallLog,
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
              confirmation_needed: true,
              pending_tool: { id: tool.id, name: tool.name, input: tool.input },
              confirmation_message: confirmMessage,
              // Save message history for resume
              message_history: [
                ...currentMessages,
                { role: 'assistant', content: assistantContent },
              ],
            },
          });

          console.log(`[agent-standalone] Job ${vps_job_id} paused for confirmation: ${confirmMessage}`);
          return; // Exit - will be resumed by confirmation watcher
        }

        // Execute the tool
        const result = await executeAgentTool(
          supabase, user_id, data.board_id || '',
          tool.name, tool.input, boardContext
        );
        const formatted = result.success ? `OK: ${result.message}` : `ERROR: ${result.message}`;

        toolCallLog.push({ name: tool.name, input: tool.input, result: formatted, success: result.success });
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: formatted });

        console.log(`[agent-standalone] Tool ${tool.name}: ${formatted.slice(0, 100)}`);
      }

      // Continue conversation
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: assistantContent },
        { role: 'user', content: toolResults },
      ];
    }

    // 8. Complete
    const costUsd = calculateCost(modelId, totalInputTokens, totalOutputTokens);
    const durationMs = Date.now() - startTime;

    await markJobComplete(vps_job_id, {
      full_output: fullOutput,
      skill_slug: skill.slug,
      skill_name: skill.name,
      iterations: iteration,
      tool_call_count: toolCallCount,
      tool_calls: toolCallLog,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cost_usd: costUsd,
      duration_ms: durationMs,
    });

    console.log(`[agent-standalone] Job ${vps_job_id} completed in ${iteration} iterations, $${costUsd.toFixed(4)}`);

  } catch (err: any) {
    const errorMsg = err.message ?? 'Unknown error';
    console.error(`[agent-standalone] Job ${vps_job_id} failed:`, errorMsg);
    await markJobFailed(vps_job_id, errorMsg);
  }
}
