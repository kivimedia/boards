import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { getSkill } from '@/lib/agent-engine';
import { executeStandaloneAgent } from '@/lib/ai/agent-executor';
import { executeSkillChain, resolveSkillChain } from '@/lib/ai/agent-chain';

export const maxDuration = 300;

/**
 * POST /api/agents/run
 * Standalone agent execution with multi-turn tool use.
 * Streams output via SSE with tool call events.
 *
 * Body: {
 *   skill_id: string;
 *   input_message: string;
 *   board_id?: string;
 *   card_id?: string;
 *   execution_id?: string;        // For resuming after confirmation
 *   confirmed_tool_call_id?: string;
 *   rejected_tool_call_id?: string;
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: {
    skill_id: string;
    input_message: string;
    board_id?: string;
    card_id?: string;
    execution_id?: string;
    confirmed_tool_call_id?: string;
    rejected_tool_call_id?: string;
    planning_mode?: boolean;
    conversation_history?: { role: 'user' | 'assistant'; content: string }[];
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.skill_id || !body.input_message) {
    return errorResponse('skill_id and input_message are required', 400);
  }

  // Load skill
  const skill = await getSkill(supabase, body.skill_id);
  if (!skill) {
    return errorResponse('Skill not found', 404);
  }

  // Stream response via SSE
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // Check if this skill has dependencies (chain execution)
        const chain = await resolveSkillChain(supabase, skill.slug);
        const isChain = chain.steps.length > 1;

        if (isChain && !body.execution_id) {
          // Execute as a skill chain
          await executeSkillChain(
            supabase,
            {
              targetSkillSlug: skill.slug,
              boardId: body.board_id,
              cardId: body.card_id,
              userId,
              inputPrompt: body.input_message,
            },
            {
              onToken: (text) => send('token', { text }),
              onComplete: (output) => {
                send('complete', {
                  output_preview: output.slice(0, 500),
                  chain_id: chain.chain_id,
                  total_steps: chain.total_steps,
                });
                controller.close();
              },
              onError: (error) => {
                send('error', { error });
                controller.close();
              },
              onChainStep: (step, skillName, status) => {
                send('chain_step', { step, skill_name: skillName, status });
              },
            }
          );
        } else {
          // Execute as standalone agent (single skill, possibly multi-turn)
          await executeStandaloneAgent(
            supabase,
            {
              skillId: body.skill_id,
              boardId: body.board_id,
              cardId: body.card_id,
              userId,
              inputMessage: body.input_message,
              executionId: body.execution_id,
              confirmedToolCallId: body.confirmed_tool_call_id,
              rejectedToolCallId: body.rejected_tool_call_id,
              planningMode: body.planning_mode,
              conversationHistory: body.conversation_history,
            },
            {
              onToken: (text) => send('token', { text }),
              onComplete: (output) => {
                send('complete', { output_preview: output.slice(0, 500) });
                controller.close();
              },
              onError: (error) => {
                send('error', { error });
                controller.close();
              },
              onToolCall: (name, input) => {
                send('tool_call', { name, input });
              },
              onToolResult: (name, result, success) => {
                send('tool_result', { name, result: result.slice(0, 500), success });
              },
              onThinking: (summary) => {
                send('thinking', { summary });
              },
              onConfirmationNeeded: (toolCallId, name, input, message) => {
                send('confirm', {
                  tool_call_id: toolCallId,
                  name,
                  input,
                  message,
                });
              },
            }
          );
        }
      } catch (err: any) {
        send('error', { error: err.message || 'Unknown error' });
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
